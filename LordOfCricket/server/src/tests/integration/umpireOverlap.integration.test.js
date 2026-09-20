// Umpire double-booking prevention — POST /matches/:matchId/umpire-slots/apply
// now additionally rejects a candidate match whose estimated [start,end)
// time range (match_date + overs-derived duration, domain/umpireAssignment/
// matchTimeRange.js) overlaps any match this umpire already holds an
// ASSIGNED slot on, enforced inside one transaction serialized per-umpire
// via a Postgres advisory lock. Real HTTP against the real app, same
// pattern as every other integration test in this codebase.
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

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-overlap-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
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

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'OVA') RETURNING *`, [`Overlap Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'OVB') RETURNING *`, [`Overlap Team B ${tag}`])).rows[0]
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

// 7:00 PM 3 days out, 20 overs/innings -> estimated range is 7:00pm to
// 12:20am (320 minutes: 20 * 2 * 8min) per matchTimeRange.js's own formula.
// +3 days (not "today") is deliberate: this file's own self-cancel test
// needs to clear the Phase 2 24h assignment lock (matchTimeRange.js's
// isAssignmentLocked) — every other test here only cares about the
// relative hour-of-day gap between matchA/matchB, which an equal forward
// shift never changes.
function matchAt(hour, minute = 0, overrides = {}) {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  d.setHours(hour, minute, 0, 0)
  return { matchDate: d.toISOString(), oversPerInnings: 20, ...overrides }
}

async function createMatch(teams, { matchDate, oversPerInnings, requiredUmpires = 1 }) {
  return matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    venue: 'Overlap Test Ground',
    matchDate,
    oversPerInnings,
    requiredUmpires,
  })
}

async function apply(server, matchId, token) {
  return json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token })
}

test('accepting Match A then a strictly overlapping Match B is rejected with OVERLAPPING_ASSIGNMENT', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('overlap-basic')
  try {
    const matchA = await createMatch(teams, matchAt(19)) // 7:00pm -> ~12:20am
    const matchB = await createMatch(teams, matchAt(20)) // 8:00pm — inside A's window

    const first = await apply(server, matchA.id, umpire.token)
    assert.equal(first.status, 201)

    const second = await apply(server, matchB.id, umpire.token)
    assert.equal(second.status, 409, JSON.stringify(second.data))
    assert.equal(second.data.code, 'OVERLAPPING_ASSIGNMENT')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a non-overlapping Match B (starts exactly when A\'s estimated window ends) IS allowed — [start,end) semantics', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('overlap-boundary')
  try {
    // Short format so the boundary is easy to hit precisely: 10 overs -> 160 min.
    const matchA = await createMatch(teams, matchAt(19, 0, { oversPerInnings: 10 })) // 7:00pm -> 9:40pm
    const matchB = await createMatch(teams, matchAt(21, 40, { oversPerInnings: 10 })) // starts exactly at A's end

    const first = await apply(server, matchA.id, umpire.token)
    assert.equal(first.status, 201)

    const second = await apply(server, matchB.id, umpire.token)
    assert.equal(second.status, 201, JSON.stringify(second.data))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a genuinely non-overlapping later match is allowed', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('overlap-separate')
  try {
    const matchA = await createMatch(teams, matchAt(6, 0, { oversPerInnings: 10 })) // early morning, short
    const matchB = await createMatch(teams, matchAt(20, 0, { oversPerInnings: 10 })) // evening, well clear

    assert.equal((await apply(server, matchA.id, umpire.token)).status, 201)
    assert.equal((await apply(server, matchB.id, umpire.token)).status, 201)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a DIFFERENT umpire is unaffected by another umpire\'s overlapping assignment', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('overlap-diff-a')
  const umpireB = await approvedUmpire('overlap-diff-b')
  try {
    const matchA = await createMatch(teams, matchAt(19), { requiredUmpires: 1 })
    const matchB = await createMatch(teams, matchAt(20), { requiredUmpires: 1 })

    assert.equal((await apply(server, matchA.id, umpireA.token)).status, 201)
    const other = await apply(server, matchB.id, umpireB.token)
    assert.equal(other.status, 201, 'a different umpire has no conflict with umpireA\'s schedule')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('cancelling the first assignment releases the conflict — the same umpire can then accept the overlapping match', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('overlap-cancel')
  try {
    const matchA = await createMatch(teams, matchAt(19))
    const matchB = await createMatch(teams, matchAt(20))

    assert.equal((await apply(server, matchA.id, umpire.token)).status, 201)
    const blocked = await apply(server, matchB.id, umpire.token)
    assert.equal(blocked.status, 409)

    const cancel = await json(`${server.baseUrl}/matches/${matchA.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(cancel.status, 200, JSON.stringify(cancel.data))

    const retried = await apply(server, matchB.id, umpire.token)
    assert.equal(retried.status, 201, 'cancelling the conflicting assignment must free the umpire up for the overlapping match')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('concurrent applications to two different overlapping matches by the same umpire: at most one succeeds', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('overlap-race')
  try {
    const matchA = await createMatch(teams, matchAt(19))
    const matchB = await createMatch(teams, matchAt(20))

    const [resA, resB] = await Promise.all([apply(server, matchA.id, umpire.token), apply(server, matchB.id, umpire.token)])
    const statuses = [resA.status, resB.status].sort()
    assert.deepEqual(statuses, [201, 409], 'the advisory lock must serialize the two concurrent applies — exactly one wins, never both')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('existing U3 atomic single-match behavior is unaffected: NO_SLOT_AVAILABLE still fires correctly once a match\'s own slots are full', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('overlap-u3-a')
  const umpireB = await approvedUmpire('overlap-u3-b')
  try {
    const match = await createMatch(teams, matchAt(19), { requiredUmpires: 1 })
    assert.equal((await apply(server, match.id, umpireA.token)).status, 201)
    const second = await apply(server, match.id, umpireB.token)
    assert.equal(second.status, 409)
    assert.equal(second.data.code, 'NO_SLOT_AVAILABLE')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
