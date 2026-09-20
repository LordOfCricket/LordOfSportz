// Phase 21 (U4) — the umpire's own self-service reads: available matches,
// my assignments, my profile (+ availability toggle). Same real-HTTP pattern
// as umpireMatchAssignment.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import * as matchService from '../../services/match.service.js'

function stubIo() {
  const chain = { emit: () => {} }
  return { emit: () => {}, to: () => chain }
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = stubIo()
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u4-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType],
  )
  const user = rows[0]
  for (const status of requestStatuses) {
    const decidedAt = status === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, status, decidedAt])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function makeTeams() {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U4 Test Team A','U4A') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U4 Test Team B','U4B') RETURNING *`)).rows[0]
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

async function createMatchWithSlots(teams, requiredUmpires = 1, matchDate = new Date().toISOString()) {
  return matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    venue: 'U4 Test Ground',
    matchDate,
    requiredUmpires,
  })
}

test('available matches: only shows upcoming matches with real open umpire capacity', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('avail-list')
  try {
    const open = await createMatchWithSlots(teams, 2)
    const full = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${full.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const noSlots = await createMatchWithSlots(teams, 0)

    const { status, data } = await json(`${server.baseUrl}/umpire/matches/available`, { token: umpire.token })
    assert.equal(status, 200)
    const ids = data.matches.map((m) => m.id)
    assert.ok(ids.includes(open.id), 'a match with open capacity must appear')
    assert.ok(!ids.includes(full.id), 'a fully-assigned match must not appear')
    assert.ok(!ids.includes(noSlots.id), 'a match with required_umpires=0 must never appear')

    const openEntry = data.matches.find((m) => m.id === open.id)
    assert.equal(openEntry.total_slots, 2)
    assert.equal(openEntry.filled_slots, 0)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('available matches: denied for a pending umpire and a normal player', async () => {
  const server = await startTestApp()
  const pending = await makeUser({ label: 'avail-pending', playerType: 'umpire', requestStatuses: ['pending'] })
  const player = await makeUser({ label: 'avail-normal', playerType: 'team_player' })
  try {
    const a = await json(`${server.baseUrl}/umpire/matches/available`, { token: pending.token })
    const b = await json(`${server.baseUrl}/umpire/matches/available`, { token: player.token })
    assert.equal(a.status, 403)
    assert.equal(b.status, 403)
  } finally {
    await pending.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('my assignments: shows this umpire\'s own slot with match/team/ground context, not another umpire\'s', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('assign-list-a')
  const umpireB = await approvedUmpire('assign-list-b')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })

    const mine = await json(`${server.baseUrl}/umpire/assignments`, { token: umpireA.token })
    assert.equal(mine.status, 200)
    assert.equal(mine.data.assignments.length, 1)
    assert.equal(mine.data.assignments[0].match_id, match.id)
    assert.equal(mine.data.assignments[0].team_a_name, teams.teamA.name)

    const other = await json(`${server.baseUrl}/umpire/assignments`, { token: umpireB.token })
    assert.equal(other.status, 200)
    assert.equal(other.data.assignments.length, 0)
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('profile: lazily created on first read, defaults are honest (zero stats, available)', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('profile-lazy')
  try {
    const { status, data } = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(status, 200)
    assert.equal(data.profile.matches_officiated, 0)
    assert.equal(data.profile.matches_cancelled, 0)
    assert.equal(data.profile.upcoming_assignments, 0)
    assert.equal(data.profile.is_available, true)
    assert.equal(data.profile.bio, null)

    const { rows } = await pool.query('SELECT * FROM umpire_profiles WHERE user_id = $1', [umpire.id])
    assert.equal(rows.length, 1, 'the row must now really exist')
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('profile: stats reflect real assignment/match state, not a stale cache', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('profile-stats')
  try {
    // Each a day apart — this umpire holds (or held) an ASSIGNED slot on
    // all three simultaneously in spirit; the double-booking check treats
    // an ASSIGNED slot as active regardless of the match's own status
    // (nothing ever demotes it away from ASSIGNED once officiated), so
    // same-instant matches here would now be a genuine, correct conflict.
    const upcomingMatch = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${upcomingMatch.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const officiatedMatch = await createMatchWithSlots(teams, 1, new Date(Date.now() + 86400000).toISOString())
    await json(`${server.baseUrl}/matches/${officiatedMatch.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'finalized' WHERE id = $1`, [officiatedMatch.id])

    const cancelledMatch = await createMatchWithSlots(teams, 1, new Date(Date.now() + 2 * 86400000).toISOString())
    await json(`${server.baseUrl}/matches/${cancelledMatch.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await json(`${server.baseUrl}/matches/${cancelledMatch.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })

    const { data } = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(data.profile.upcoming_assignments, 1)
    assert.equal(data.profile.matches_officiated, 1)
    assert.equal(data.profile.matches_cancelled, 1)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('profile: PATCH updates availability and preserves bio when omitted', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('profile-patch')
  try {
    const first = await json(`${server.baseUrl}/umpire/profile`, { method: 'PATCH', token: umpire.token, body: { bio: 'Local league umpire, 5 years.' } })
    assert.equal(first.status, 200)
    assert.equal(first.data.profile.bio, 'Local league umpire, 5 years.')
    assert.equal(first.data.profile.is_available, true)

    const second = await json(`${server.baseUrl}/umpire/profile`, { method: 'PATCH', token: umpire.token, body: { isAvailable: false } })
    assert.equal(second.status, 200)
    assert.equal(second.data.profile.is_available, false)
    assert.equal(second.data.profile.bio, 'Local league umpire, 5 years.', 'bio must be preserved when the PATCH omits it')
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('profile: denied for a rejected umpire and staff', async () => {
  const server = await startTestApp()
  const rejected = await makeUser({ label: 'profile-rejected', playerType: 'umpire', requestStatuses: ['rejected'] })
  const staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)).rows[0].id
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Staff Profile', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
    [`integration-test-u4-staff-${Date.now()}@example.test`, staffRoleId],
  )
  const staff = { id: rows[0].id, token: signToken({ id: rows[0].id }) }
  try {
    const a = await json(`${server.baseUrl}/umpire/profile`, { token: rejected.token })
    const b = await json(`${server.baseUrl}/umpire/profile`, { token: staff.token })
    assert.equal(a.status, 403)
    assert.equal(b.status, 403, 'super_admin has no umpire self-data of their own — no bypass here')
  } finally {
    await rejected.cleanup()
    await pool.query('DELETE FROM users WHERE id = $1', [staff.id])
    await server.close()
  }
})
