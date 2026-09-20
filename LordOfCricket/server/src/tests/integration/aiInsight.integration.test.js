// Phase 16 integration tests — real PostgreSQL, real scoring/finalize/
// correction flow, a FAKE AI provider (no live API key exists in this
// environment — see docs/TECHNICAL_DEBT.md). Exercises the real caching/
// fingerprint/validation/privacy/failure pipeline end to end.
//
// MongoDB cleanup, Phase 2: the AiInsight CACHE itself is now PostgreSQL-
// backed (server/src/models/aiInsight.model.js) — every test below that
// reaches into the cache directly now uses findAiInsight/deleteAiInsight
// instead of the retired Mongoose model, and the CACHING/CRITICAL
// CORRECTION tests no longer need a MongoDB-reachability skip guard (the
// cache they exercise is Postgres, a hard dependency, not optional Mongo).
// A live MongoDB connection is still opened here ONLY for the migration
// idempotency tests at the bottom, which seed disposable legacy-format
// documents via the retired Mongoose model
// (aiInsightMongoLegacy.model.js) — mirroring galleryImage.integration.test.js's
// Phase 1 pattern exactly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { pool, connectMongo } from '../../config/db.js'
import * as aiInsightService from '../../services/aiInsight.service.js'
import { getMatchSummary } from '../../services/matchSummary.service.js'
import { finalizeMatch } from '../../services/match.service.js'
import * as correctionService from '../../services/correction.service.js'
import { findAiInsight, deleteAiInsight } from '../../models/aiInsight.model.js'
import AiInsightMongo from '../../models/aiInsightMongoLegacy.model.js'
import { runAiInsightMigration } from '../../scripts/migrateAiInsightsToPostgres.js'
import { createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'
import { makeFakeProvider, VALID_MATCH_INSIGHT_RESPONSE, VALID_PERSON_INSIGHT_RESPONSE } from './aiFixtures.js'

await connectMongo()

async function cleanupAiInsight(sourceType, sourceId) {
  if (sourceId != null) await deleteAiInsight({ sourceType, sourceId })
}

test('NOT_CONFIGURED — the real (unconfigured) provider never throws, degrades gracefully', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    // No `provider` override here — this exercises the REAL ai/aiProvider.js,
    // which is unconfigured in this environment (no AI_API_KEY). Must not throw.
    const result = await aiInsightService.getMatchInsight(played.matchId)
    assert.equal(result.available, false)
    assert.equal(result.reason, 'NOT_CONFIGURED')
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('INSUFFICIENT_DATA — a non-finalized match never gets a fabricated insight', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const played = await playShortFinalizedMatch(fx, { finalize: false })
    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE })
    const result = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'INSUFFICIENT_DATA')
    assert.equal(provider.calls.length, 0, 'the provider must never be called for a non-finalized match')
  } finally {
    await fx.cleanup()
  }
})

test('404 — a nonexistent match/player/team is a real 404, never a fabricated INSUFFICIENT_DATA', async () => {
  await assert.rejects(() => aiInsightService.getMatchInsight(999999999), (err) => err.statusCode === 404)
  await assert.rejects(() => aiInsightService.getPlayerInsight('LOC-DOESNOTEXIST'), (err) => err.statusCode === 404)
  await assert.rejects(() => aiInsightService.getTeamInsight(999999999), (err) => err.statusCode === 404)
})

test('CACHING — a successful insight is cached; a repeat request never calls the provider again', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE })

    const first = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(first.available, true)
    assert.equal(first.cached, false)
    assert.equal(provider.calls.length, 1)

    const second = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(second.available, true)
    assert.equal(second.cached, true)
    assert.equal(provider.calls.length, 1, 'a cache hit must never re-invoke the provider')
    assert.deepEqual(second.insight, first.insight)
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('CONCURRENT REQUESTS — two simultaneous requests for the same source de-dupe to one provider call', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE, delayMs: 150 })

    const [a, b] = await Promise.all([aiInsightService.getMatchInsight(played.matchId, { provider }), aiInsightService.getMatchInsight(played.matchId, { provider })])
    assert.equal(a.available, true)
    assert.equal(b.available, true)
    assert.equal(provider.calls.length, 1, 'concurrent requests for the same source must be single-flighted')
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('CRITICAL CORRECTION TEST — a change to the underlying authoritative data invalidates the cached insight; the stale payload is never silently served', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE })

    const before = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(before.available, true)
    const cachedDoc = await findAiInsight({ sourceType: 'MATCH', sourceId: played.matchId })
    const fingerprintBefore = cachedDoc.source_fingerprint

    // Simulate the effect of a correction: a correction always bumps
    // innings.version (see correction.service.js's applyCorrection — the
    // SAME counter this fingerprint is keyed on). A real correction cannot
    // be applied to an ALREADY-FINALIZED match (correctly rejected,
    // MATCH_LOCKED — see the "REAL CORRECTION, PRE-FINALIZE" test below for
    // that exact real flow) — finalize is a one-way lock, so this directly
    // exercises the fingerprint/staleness MECHANISM against the only state
    // change that could ever reach a finalized match's underlying rows.
    await pool.query('UPDATE innings SET version = version + 1 WHERE match_id = $1 AND innings_number = 1', [played.matchId])

    const after = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(after.available, true)
    assert.equal(after.cached, false, 'the fingerprint mismatch must force regeneration, never serve the stale cached payload')
    assert.equal(provider.calls.length, 2, 'exactly one regeneration must have happened')

    const cachedDocAfter = await findAiInsight({ sourceType: 'MATCH', sourceId: played.matchId })
    assert.notEqual(cachedDocAfter.source_fingerprint, fingerprintBefore)
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('REAL CORRECTION, PRE-FINALIZE — a genuine correction changes the match result before finalize; the eventually-generated insight reflects the CORRECTED result, never the original', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx, { finalize: false })
    const completedMatch = (await pool.query('SELECT * FROM matches WHERE id = $1', [played.matchId])).rows[0]
    assert.equal(completedMatch.status, 'completed')

    // Apply a real, legitimate correction while the match is still only
    // 'completed' (corrections are locked once 'finalized' — MATCH_LOCKED).
    // playShortFinalizedMatch's innings 1 opens with a four (batRuns: 4) —
    // correct it down to 0 to flip the margin/target.
    const inn1 = (await pool.query('SELECT * FROM innings WHERE match_id = $1 AND innings_number = 1', [played.matchId])).rows[0]
    const firstDelivery = (await pool.query('SELECT * FROM deliveries WHERE innings_id = $1 ORDER BY log_sequence ASC LIMIT 1', [inn1.id])).rows[0]
    await correctionService.applyCorrection({
      inningsId: inn1.id,
      targetType: 'delivery',
      targetId: firstDelivery.id,
      reasonCode: 'WRONG_RUNS',
      patch: { batRuns: 0 },
      correctedByUserId: fx.userId,
    })

    const finalized = await finalizeMatch(played.matchId)
    const teamNames = (await pool.query('SELECT id, name FROM teams WHERE id = ANY($1)', [[fx.teamAId, fx.teamBId]])).rows
    const nameById = new Map(teamNames.map((t) => [t.id, t.name]))
    const expectedWinnerName = finalized.winner_team_id ? nameById.get(finalized.winner_team_id) : null

    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE })
    const result = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(result.available, true)

    // The context the fake provider actually received must reflect the
    // FINAL (corrected) result — never the pre-correction one.
    const sentFacts = provider.calls[0].factsPayload
    assert.equal(sentFacts.result.resultType, finalized.result_type)
    assert.equal(sentFacts.result.resultMargin, finalized.result_margin)
    assert.equal(sentFacts.result.winnerTeamName, expectedWinnerName)
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('RESULT TRUTH TEST — AI output can never mutate matches/innings/statistics, even a response that contradicts the real result', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const beforeMatch = (await pool.query('SELECT * FROM matches WHERE id = $1', [played.matchId])).rows[0]
    const beforeInnings = (await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [played.matchId])).rows

    const contradictingResponse = { ...VALID_MATCH_INSIGHT_RESPONSE, headline: 'Team B wins in a stunning upset', summary: 'Team B secured a comfortable victory, contradicting the official record entirely.' }
    const provider = makeFakeProvider({ response: contradictingResponse })
    const result = await aiInsightService.getMatchInsight(played.matchId, { provider })
    assert.equal(result.available, true) // the contradictory NARRATIVE is still structurally valid JSON — accepted as text, but it can never become truth

    const afterMatch = (await pool.query('SELECT * FROM matches WHERE id = $1', [played.matchId])).rows[0]
    const afterInnings = (await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [played.matchId])).rows
    assert.deepEqual(afterMatch.winner_team_id, beforeMatch.winner_team_id)
    assert.deepEqual(afterMatch.result_type, beforeMatch.result_type)
    assert.deepEqual(afterMatch.result_margin, beforeMatch.result_margin)
    assert.deepEqual(afterInnings.map((i) => i.runs), beforeInnings.map((i) => i.runs))
    assert.deepEqual(afterInnings.map((i) => i.wickets), beforeInnings.map((i) => i.wickets))
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('PROVIDER FAILURE — a provider error/timeout never breaks the endpoint; the match read remains fully usable', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const failingProvider = makeFakeProvider({ error: Object.assign(new Error('simulated timeout'), { code: 'ETIMEDOUT' }) })
    const result = await aiInsightService.getMatchInsight(played.matchId, { provider: failingProvider })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'PROVIDER_ERROR')

    // The underlying, unrelated read (existing Match Summary architecture) is completely unaffected.
    const summary = await getMatchSummary(played.matchId)
    assert.equal(summary.match.isOfficial, true)
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('INVALID_OUTPUT — malformed/out-of-schema provider JSON is rejected, never trusted blindly', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const badProvider = makeFakeProvider({ response: { headline: 'ok' } }) // missing required fields
    const result = await aiInsightService.getMatchInsight(played.matchId, { provider: badProvider })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'INVALID_OUTPUT')
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('PRIVACY — the exact context sent to the provider never contains email/phone/password/tokens', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_MATCH_INSIGHT_RESPONSE })
    await aiInsightService.getMatchInsight(played.matchId, { provider })

    assert.equal(provider.calls.length, 1)
    const sentPayload = JSON.stringify(provider.calls[0].factsPayload).toLowerCase()
    for (const forbidden of ['email', 'password', 'phone', 'token', 'refresh', 'booking', 'canteen']) {
      assert.ok(!sentPayload.includes(forbidden), `context sent to the AI provider must never contain '${forbidden}'`)
    }
  } finally {
    await cleanupAiInsight('MATCH', played?.matchId)
    await fx.cleanup()
  }
})

test('PLAYER INSIGHT — uses the real official statistics service, no independent cricket calculation', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  const player = fx.squadA[0]
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_PERSON_INSIGHT_RESPONSE })
    const result = await aiInsightService.getPlayerInsight(player.public_player_id, { provider })
    assert.equal(result.available, true)
    const sentFacts = provider.calls[0].factsPayload
    assert.equal(sentFacts.publicPlayerId, player.public_player_id)
    assert.ok(sentFacts.matches >= 1)
  } finally {
    await cleanupAiInsight('PLAYER', player?.public_player_id)
    await fx.cleanup()
  }
})

test('TEAM INSIGHT — uses the real official team profile, no independent cricket calculation', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  let played
  try {
    played = await playShortFinalizedMatch(fx)
    const provider = makeFakeProvider({ response: VALID_PERSON_INSIGHT_RESPONSE })
    const result = await aiInsightService.getTeamInsight(fx.teamAId, { provider })
    assert.equal(result.available, true)
    const sentFacts = provider.calls[0].factsPayload
    assert.equal(sentFacts.teamId, fx.teamAId)
  } finally {
    await cleanupAiInsight('TEAM', fx.teamAId)
    await fx.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Migration script (Phase 2) — idempotency / resumability against the REAL
// migration logic (not a reimplementation), using disposable MongoDB
// fixtures so real cache data is never at risk. Mirrors
// galleryImage.integration.test.js's Phase 1 pattern exactly.
// ---------------------------------------------------------------------------

// Realistic-length: a real sourceId is either a small integer (matchId/
// teamId) or a public_player_id (VARCHAR(20) — see schema.sql), so this
// stays well under ai_insights.source_id's VARCHAR(30) the same way real
// data always would.
function uniqueSourceId() {
  return `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

test('migration script: running twice never creates duplicate PostgreSQL rows, and correctly reports inserted vs updated', async () => {
  const sourceId = uniqueSourceId()
  const fixtureDoc = await AiInsightMongo.create({
    sourceType: 'MATCH',
    sourceId,
    sourceFingerprint: 'f'.repeat(64),
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    payload: { headline: 'Migration fixture', summary: 'temporary', keyMoments: [], standoutPerformers: [] },
  })

  try {
    const firstRun = await runAiInsightMigration()
    const firstRecord = firstRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(firstRecord.status, 'inserted')

    const afterFirst = await pool.query('SELECT COUNT(*)::int AS count FROM ai_insights WHERE legacy_mongo_id = $1', [
      String(fixtureDoc._id),
    ])
    assert.equal(afterFirst.rows[0].count, 1)

    const secondRun = await runAiInsightMigration()
    const secondRecord = secondRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(secondRecord.status, 'updated')
    assert.equal(secondRecord.postgresId, firstRecord.postgresId, 're-running must update the SAME row, not insert a new one')

    const afterSecond = await pool.query('SELECT COUNT(*)::int AS count FROM ai_insights WHERE legacy_mongo_id = $1', [
      String(fixtureDoc._id),
    ])
    assert.equal(afterSecond.rows[0].count, 1, 'no duplicate row was created on the second run')

    // Field-by-field: the migrated row matches the MongoDB source exactly,
    // including the JSONB payload (never flattened, never truncated).
    const { rows } = await pool.query('SELECT * FROM ai_insights WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    const migrated = rows[0]
    assert.equal(migrated.source_type, fixtureDoc.sourceType)
    assert.equal(migrated.source_id, fixtureDoc.sourceId)
    assert.equal(migrated.source_fingerprint, fixtureDoc.sourceFingerprint)
    assert.equal(migrated.provider, fixtureDoc.provider)
    assert.equal(migrated.model, fixtureDoc.model)
    assert.deepEqual(migrated.payload, fixtureDoc.payload)

    // The migrated row is immediately usable by the live cache-read path —
    // proves the migration didn't just write compatible-looking data, it
    // wrote data the real service can actually serve from cache.
    const viaService = await findAiInsight({ sourceType: 'MATCH', sourceId })
    assert.equal(viaService.source_fingerprint, fixtureDoc.sourceFingerprint)
  } finally {
    await pool.query('DELETE FROM ai_insights WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    await AiInsightMongo.deleteOne({ _id: fixtureDoc._id })
  }
})

test('migration script: a document missing a required field is skipped, not failed, and does not abort the run', async () => {
  const sourceId = uniqueSourceId()
  const fixtureDoc = await AiInsightMongo.collection.insertOne({
    sourceType: 'MATCH',
    sourceId,
    // no sourceFingerprint/provider/model/payload — simulates corrupt/incomplete legacy data
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  try {
    const run = await runAiInsightMigration()
    const record = run.results.find((r) => r.legacyMongoId === String(fixtureDoc.insertedId))
    assert.equal(record.status, 'skipped')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM ai_insights WHERE legacy_mongo_id = $1', [
      String(fixtureDoc.insertedId),
    ])
    assert.equal(rows[0].count, 0, 'an invalid document must never be written to PostgreSQL')
  } finally {
    await AiInsightMongo.collection.deleteOne({ _id: fixtureDoc.insertedId })
  }
})

test.after(async () => {
  await mongoose.connection.close()
})
