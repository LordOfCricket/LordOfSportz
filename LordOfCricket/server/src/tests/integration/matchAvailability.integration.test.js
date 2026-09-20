// Phase 14 Part 1 — player match availability/RSVP, proved against real
// PostgreSQL through the actual service layer (same pattern as Phase 13's
// teamRoster.integration.test.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as availabilityService from '../../services/matchAvailability.service.js'
import * as matchService from '../../services/match.service.js'
import { pool } from '../../config/db.js'
import { createTeamsFixture } from './fixtures.js'

async function makeUserForPlayer(playerId) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('RSVP Test User', $1, 'not-a-real-hash', 'player') RETURNING *`,
    [`rsvp-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`]
  )
  const user = rows[0]
  await pool.query('UPDATE players SET user_id = $1 WHERE id = $2', [user.id, playerId])
  return user
}

async function makeUpcomingMatch(fx) {
  return matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'RSVP Test Ground', matchDate: new Date().toISOString(), oversPerInnings: 10, ballsPerOver: 6 })
}

test('RSVP: an eligible player can set AVAILABLE, it persists and is reflected on read', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const match = await makeUpcomingMatch(fx)
  const user = await makeUserForPlayer(fx.squadA[0].id)
  try {
    const before = await availabilityService.getMyAvailability(user.id, match.id)
    assert.deepEqual(before, { eligible: true, status: 'PENDING' })

    const result = await availabilityService.setMyAvailability(user.id, match.id, 'AVAILABLE')
    assert.deepEqual(result, { eligible: true, status: 'AVAILABLE' })

    const after = await availabilityService.getMyAvailability(user.id, match.id)
    assert.equal(after.status, 'AVAILABLE', 'response remains visible on refresh')
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    await fx.cleanup()
  }
})

test('RSVP: a player can change their response, the new value overwrites the old (upsert, not a second row)', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const match = await makeUpcomingMatch(fx)
  const user = await makeUserForPlayer(fx.squadA[0].id)
  try {
    await availabilityService.setMyAvailability(user.id, match.id, 'AVAILABLE')
    const changed = await availabilityService.setMyAvailability(user.id, match.id, 'NOT_AVAILABLE')
    assert.equal(changed.status, 'NOT_AVAILABLE')

    const rows = await pool.query('SELECT * FROM match_availability WHERE match_id = $1', [match.id])
    assert.equal(rows.rows.length, 1, 'one row per (match, player) — never accumulates duplicates')
    assert.equal(rows.rows[0].status, 'NOT_AVAILABLE')
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    await fx.cleanup()
  }
})

test('RSVP: a player on neither team is not eligible, and cannot set availability', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const otherFx = await createTeamsFixture({ squadSize: 1 })
  const match = await makeUpcomingMatch(fx)
  const outsiderUser = await makeUserForPlayer(otherFx.squadA[0].id)
  try {
    const check = await availabilityService.getMyAvailability(outsiderUser.id, match.id)
    assert.deepEqual(check, { eligible: false, status: null })

    await assert.rejects(
      () => availabilityService.setMyAvailability(outsiderUser.id, match.id, 'AVAILABLE'),
      (err) => err.statusCode === 403
    )
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [outsiderUser.id])
    await fx.cleanup()
    await otherFx.cleanup()
  }
})

test('RSVP: one player changing their own availability never affects a teammate\'s response (isolation)', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const match = await makeUpcomingMatch(fx)
  const userA = await makeUserForPlayer(fx.squadA[0].id)
  const userB = await makeUserForPlayer(fx.squadA[1].id)
  try {
    await availabilityService.setMyAvailability(userA.id, match.id, 'AVAILABLE')
    await availabilityService.setMyAvailability(userB.id, match.id, 'NOT_AVAILABLE')

    const a = await availabilityService.getMyAvailability(userA.id, match.id)
    const b = await availabilityService.getMyAvailability(userB.id, match.id)
    assert.equal(a.status, 'AVAILABLE')
    assert.equal(b.status, 'NOT_AVAILABLE', "player B's status is untouched by player A's write")
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userA.id, userB.id])
    await fx.cleanup()
  }
})

test('RSVP: server rejects a status change once the match is no longer upcoming (not just a disabled button)', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  const match = await makeUpcomingMatch(fx)
  const user = await makeUserForPlayer(fx.squadA[0].id)
  try {
    await availabilityService.setMyAvailability(user.id, match.id, 'AVAILABLE')

    // Move the match past 'upcoming' via the real lifecycle (roster + toss + start).
    for (const p of fx.squadA.slice(0, 4)) await pool.query(`INSERT INTO match_players (match_id, team_id, player_id, is_playing_xi) VALUES ($1,$2,$3,true)`, [match.id, fx.teamAId, p.id])
    for (const p of fx.squadB.slice(0, 4)) await pool.query(`INSERT INTO match_players (match_id, team_id, player_id, is_playing_xi) VALUES ($1,$2,$3,true)`, [match.id, fx.teamBId, p.id])
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)

    await assert.rejects(
      () => availabilityService.setMyAvailability(user.id, match.id, 'NOT_AVAILABLE'),
      (err) => err.statusCode === 409
    )

    // The last valid response must remain readable, unchanged.
    const after = await availabilityService.getMyAvailability(user.id, match.id)
    assert.equal(after.status, 'AVAILABLE')
  } finally {
    await pool.query('DELETE FROM innings WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM match_players WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    await fx.cleanup()
  }
})

test('RSVP: organizer/staff view lists every eligible player, PENDING by default, never omitting a non-responder', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const match = await makeUpcomingMatch(fx)
  const user = await makeUserForPlayer(fx.squadA[0].id)
  try {
    await availabilityService.setMyAvailability(user.id, match.id, 'AVAILABLE')

    const list = await availabilityService.listMatchAvailability(match.id)
    assert.equal(list.length, 4, 'both full squads (2+2) are eligible and listed')
    const responded = list.find((p) => p.playerId === fx.squadA[0].id)
    assert.equal(responded.status, 'AVAILABLE')
    const notResponded = list.find((p) => p.playerId === fx.squadA[1].id)
    assert.equal(notResponded.status, 'PENDING')
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    await fx.cleanup()
  }
})

test('RSVP: availability is informational only — it never writes to match_players / Playing XI', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  const match = await makeUpcomingMatch(fx)
  const user = await makeUserForPlayer(fx.squadA[0].id)
  try {
    await availabilityService.setMyAvailability(user.id, match.id, 'AVAILABLE')
    const mpRows = await pool.query('SELECT * FROM match_players WHERE match_id = $1', [match.id])
    assert.equal(mpRows.rows.length, 0, 'no match_players row was ever created as a side effect of RSVP')
  } finally {
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    await fx.cleanup()
  }
})
