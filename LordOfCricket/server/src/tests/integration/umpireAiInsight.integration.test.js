// Umpire Intelligence & Scale 2.0, Workstreams L/M/N — the umpire AI
// performance summary, reusing the exact caching/fingerprint/failure
// pipeline aiInsight.integration.test.js already proves for match/player/
// team. A FAKE provider (no live API key in this environment), same as
// every other AI test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import * as aiInsightService from '../../services/aiInsight.service.js'
import { deleteAiInsight } from '../../models/aiInsight.model.js'
import { makeFakeProvider, VALID_PERSON_INSIGHT_RESPONSE } from './aiFixtures.js'

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-aiump-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await deleteAiInsight({ sourceType: 'UMPIRE', sourceId: String(user.id) })
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'AIA') RETURNING id`, [`AI Ump Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'AIB') RETURNING id`, [`AI Ump Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

// One real completed officiating record — direct SQL bulk insert, mirroring
// the established pattern from umpireReputationScenarios/umpireTrend's own
// fixtures for exactly this "give this umpire real history" need.
async function givOneCompletedMatch(teams, umpire) {
  const { rows: matchRows } = await pool.query(
    `INSERT INTO matches (team_a_id, team_b_id, match_date, status) VALUES ($1,$2,NOW() - INTERVAL '1 day','completed') RETURNING id`,
    [teams.teamA.id, teams.teamB.id],
  )
  const matchId = matchRows[0].id
  const { rows: slotRows } = await pool.query(
    `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, completed_at) VALUES ($1,1,'COMPLETED',$2,NOW()) RETURNING id`,
    [matchId, umpire.id],
  )
  await pool.query(`INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type) VALUES ($1,$2,$3,'COMPLETED')`, [
    slotRows[0].id,
    matchId,
    umpire.id,
  ])
  return matchId
}

test('INSUFFICIENT_DATA — a brand-new umpire with zero matches/reviews never gets a fabricated insight', async () => {
  const umpire = await approvedUmpire('insufficient')
  try {
    const provider = makeFakeProvider({ response: VALID_PERSON_INSIGHT_RESPONSE })
    const result = await aiInsightService.getUmpireInsight(umpire.id, { provider })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'INSUFFICIENT_DATA')
    assert.equal(provider.calls.length, 0, 'the provider must never be called for an umpire with no history at all')
  } finally {
    await umpire.cleanup()
  }
})

test('NOT_CONFIGURED — the real (unconfigured) provider degrades gracefully, never throws, for an umpire who DOES have real history', async () => {
  const umpire = await approvedUmpire('notconfigured')
  const teams = await makeTeams()
  try {
    await givOneCompletedMatch(teams, umpire)
    // No provider override — exercises the real, unconfigured ai/aiProvider.js.
    const result = await aiInsightService.getUmpireInsight(umpire.id)
    assert.equal(result.available, false)
    assert.equal(result.reason, 'NOT_CONFIGURED')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('CACHING — a successful insight is cached; a repeat request never calls the provider again, and only already-approved structured data reaches it', async () => {
  const umpire = await approvedUmpire('caching')
  const teams = await makeTeams()
  try {
    await givOneCompletedMatch(teams, umpire)

    const provider = makeFakeProvider({ response: VALID_PERSON_INSIGHT_RESPONSE })
    const first = await aiInsightService.getUmpireInsight(umpire.id, { provider })
    assert.equal(first.available, true, JSON.stringify(first))
    assert.equal(first.cached, false)
    assert.equal(provider.calls.length, 1)

    // The facts payload sent to the provider must be structured data only —
    // no email, no raw DB row, just the whitelisted projection.
    const sentFacts = provider.calls[0].factsPayload
    assert.equal(sentFacts.matchesOfficiated, 1)
    assert.ok(!('email' in sentFacts))
    assert.ok(!('userId' in sentFacts))

    const second = await aiInsightService.getUmpireInsight(umpire.id, { provider })
    assert.equal(second.available, true)
    assert.equal(second.cached, true)
    assert.equal(provider.calls.length, 1, 'a cache hit must never re-invoke the provider')
    assert.deepEqual(second.insight, first.insight)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('PROVIDER_ERROR — a provider failure never surfaces as a thrown error, and never breaks the surrounding read', async () => {
  const umpire = await approvedUmpire('providererror')
  const teams = await makeTeams()
  try {
    await givOneCompletedMatch(teams, umpire)
    const provider = makeFakeProvider({ error: new Error('simulated provider timeout') })
    const result = await aiInsightService.getUmpireInsight(umpire.id, { provider })
    assert.equal(result.available, false)
    assert.equal(result.reason, 'PROVIDER_ERROR')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('the AI insight can never override trusted numeric values — the response never carries a rating/reliability field the DB does not agree with', async () => {
  const umpire = await approvedUmpire('nooverride')
  const teams = await makeTeams()
  try {
    await givOneCompletedMatch(teams, umpire)
    const provider = makeFakeProvider({ response: VALID_PERSON_INSIGHT_RESPONSE })
    const result = await aiInsightService.getUmpireInsight(umpire.id, { provider })
    assert.equal(result.available, true)
    // PERSON_INSIGHT_SCHEMA only allows headline/summary/highlights (strings)
    // — structurally incapable of carrying a numeric rating/reliability
    // field the model could have invented, since additionalProperties:false
    // and the schema has no numeric fields at all.
    assert.deepEqual(Object.keys(result.insight).sort(), ['headline', 'highlights', 'summary'])
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})
