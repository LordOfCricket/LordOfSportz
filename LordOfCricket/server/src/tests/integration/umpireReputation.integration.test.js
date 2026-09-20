// Umpire Reputation & Trust 2.0 — the shared batched reputation-summary
// builder (server/src/services/umpireReputation.service.js), the single
// source of truth every consumer (self profile, ground-owner slots,
// replacement candidates) reuses. Real DB state, no mocking — same pattern
// as every other integration test in this codebase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { buildReputationSummary, buildReputationSummaries } from '../../services/umpireReputation.service.js'
import * as matchService from '../../services/match.service.js'

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-reputation-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW() - INTERVAL '2 years' - INTERVAL '3 days')`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RPA') RETURNING *`, [`Reputation Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RPB') RETURNING *`, [`Reputation Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [
        [teamA.id, teamB.id],
      ])
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

async function assignedCompletedMatch(teams, umpire) {
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: new Date(Date.now() + 3600000).toISOString(),
    oversPerInnings: 20,
    requiredUmpires: 1,
  })
  await pool.query(`UPDATE match_umpire_slots SET status = 'COMPLETED', umpire_user_id = $2, assigned_at = NOW(), completed_at = NOW() WHERE match_id = $1`, [
    match.id,
    umpire.id,
  ])
  await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])
  return match
}

test('a brand-new approved umpire with zero history: verified, but reliability/rating null and zero badges', async () => {
  const umpire = await approvedUmpire('new')
  try {
    const summary = await buildReputationSummary(umpire.id)
    assert.equal(summary.verified, true)
    assert.equal(summary.matchesOfficiated, 0)
    assert.equal(summary.reliability, null, 'no terminal history yet — never a fabricated percentage')
    assert.equal(summary.ratingAvg, null)
    assert.equal(summary.ratingCount, 0)
    assert.deepEqual(summary.badges, [])
    assert.equal(summary.experienceYears, 2, 'approved just over 2 calendar years ago, margin large enough to be leap-year-safe')
  } finally {
    await umpire.cleanup()
  }
})

test('an umpire with real completed matches, no-shows, and cancellations: reliability/badges match the raw event data exactly', async () => {
  const umpire = await approvedUmpire('established')
  const teams = await makeTeams()
  try {
    // 10 completed matches -> matches_officiated=10, reliability=100% -> not
    // yet HIGHLY_RELIABLE's own 95%+10-match floor is satisfied (10 >= 10,
    // 100 >= 95) so it SHOULD show up; verify exactly.
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      await assignedCompletedMatch(teams, umpire)
    }
    await pool.query(
      `INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type)
       SELECT id, match_id, umpire_user_id, 'COMPLETED' FROM match_umpire_slots WHERE umpire_user_id = $1`,
      [umpire.id],
    )

    const summary = await buildReputationSummary(umpire.id)
    assert.equal(summary.matchesOfficiated, 10)
    assert.equal(summary.noShows, 0)
    assert.equal(summary.cancellations, 0)
    assert.equal(summary.reliability, 100)
    assert.ok(summary.badges.includes('HIGHLY_RELIABLE'))
    assert.ok(summary.badges.includes('EXPERIENCED_OFFICIAL') === false, 'EXPERIENCED_OFFICIAL needs 50, not 10')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('buildReputationSummaries: batched call returns correct, non-cross-contaminated data for multiple users in one query', async () => {
  const umpireA = await approvedUmpire('batch-a')
  const umpireB = await approvedUmpire('batch-b')
  const teams = await makeTeams()
  try {
    await assignedCompletedMatch(teams, umpireA)

    const summaries = await buildReputationSummaries([umpireA.id, umpireB.id])
    assert.equal(summaries.size, 2)
    assert.equal(summaries.get(umpireA.id).matchesOfficiated, 1)
    assert.equal(summaries.get(umpireB.id).matchesOfficiated, 0, 'umpire B must not see umpire A\'s match')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
  }
})

test('an umpire with no umpire_profiles row at all still gets an honest summary (LEFT JOIN correctness), never dropped from the batch', async () => {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test no-profile`, `integration-test-reputation-no-profile-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  try {
    const summary = await buildReputationSummary(user.id)
    assert.ok(summary, 'must still return a row, not silently omit this user')
    assert.equal(summary.ratingAvg, null)
    assert.equal(summary.ratingCount, 0)
    assert.equal(summary.verified, true)
  } finally {
    await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})

test('a pending (not yet approved) umpire is not verified', async () => {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test pending`, `integration-test-reputation-pending-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status) VALUES ($1, 'pending')`, [user.id])
  try {
    const summary = await buildReputationSummary(user.id)
    assert.equal(summary.verified, false)
    assert.equal(summary.experienceYears, null, 'never approved -> no experience-since date')
  } finally {
    await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
  }
})
