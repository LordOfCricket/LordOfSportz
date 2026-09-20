// Umpire availability calendar (Phase 23, Workstream A) — weekly recurring
// rules + date-specific overrides, self-managed via /umpire/availability,
// and enforced as a new gate inside POST /matches/:matchId/umpire-slots/
// apply alongside the existing U10 overlap check. Also covers the new
// append-only umpire_assignment_events log (Phase 23) that both apply and
// cancel now write to. Real HTTP against the real app, same pattern as
// umpireOverlap.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import * as matchService from '../../services/match.service.js'
import { groundTodayDateStr, addDaysToDateStr } from '../../domain/shared/groundTime.js'

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
  return { status: res.status, data: res.status === 204 ? null : await res.json() }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-availability-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_weekly_availability WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_date_availability WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'AVA') RETURNING *`, [`Availability Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'AVB') RETURNING *`, [`Availability Team B ${tag}`])).rows[0]
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

// 3 days out, not "today" — this file's self-cancel tests need to clear
// Phase 2's 24h assignment lock (matchTimeRange.js#isAssignmentLocked);
// every other test here only cares about the hour-of-day, unaffected by an
// equal forward shift.
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
    venue: 'Availability Test Ground',
    matchDate,
    oversPerInnings,
    requiredUmpires,
  })
}

async function apply(server, matchId, token) {
  return json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token })
}

test('a weekly-unavailable day blocks apply with NOT_AVAILABLE', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('weekly-block')
  try {
    const fixture = matchAt(19)
    // The day-of-week of the match itself (3 days out — see matchAt's own
    // comment), not "today" — those diverged once matchAt stopped being
    // same-day for the Phase 2 24h-lock fix below.
    const dayOfWeek = new Date(fixture.matchDate).getDay()

    const weeklySet = await json(`${server.baseUrl}/umpire/availability/weekly`, {
      method: 'PATCH',
      token: umpire.token,
      body: { dayOfWeek, isAvailable: false },
    })
    assert.equal(weeklySet.status, 200, JSON.stringify(weeklySet.data))

    const match = await createMatch(teams, fixture)
    const res = await apply(server, match.id, umpire.token)
    assert.equal(res.status, 409, JSON.stringify(res.data))
    assert.equal(res.data.code, 'NOT_AVAILABLE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a date-specific override wins over an otherwise-available weekly rule', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('date-override')
  try {
    const match = await createMatch(teams, matchAt(19))
    const matchDateStr = new Date(match.match_date).toISOString().slice(0, 10)

    const override = await json(`${server.baseUrl}/umpire/availability/date`, {
      method: 'PATCH',
      token: umpire.token,
      body: { date: matchDateStr, isAvailable: false },
    })
    assert.equal(override.status, 200, JSON.stringify(override.data))

    const res = await apply(server, match.id, umpire.token)
    assert.equal(res.status, 409, JSON.stringify(res.data))
    assert.equal(res.data.code, 'NOT_AVAILABLE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('deleting a date override restores the default-available behavior', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('date-delete')
  try {
    const match = await createMatch(teams, matchAt(19))
    const matchDateStr = new Date(match.match_date).toISOString().slice(0, 10)

    await json(`${server.baseUrl}/umpire/availability/date`, {
      method: 'PATCH',
      token: umpire.token,
      body: { date: matchDateStr, isAvailable: false },
    })
    const del = await json(`${server.baseUrl}/umpire/availability/date/${matchDateStr}`, { method: 'DELETE', token: umpire.token })
    assert.equal(del.status, 204)

    const res = await apply(server, match.id, umpire.token)
    assert.equal(res.status, 201, JSON.stringify(res.data))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('GET /umpire/availability reflects what was just set', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('get-availability')
  try {
    await json(`${server.baseUrl}/umpire/availability/weekly`, { method: 'PATCH', token: umpire.token, body: { dayOfWeek: 2, isAvailable: false } })
    // A fixed future offset, not a hardcoded absolute date — the original
    // literal ('2026-08-18') was in the future when this test was written
    // but silently became "yesterday" as real time passed in this dev
    // environment, causing the date-override PATCH to be rejected as a
    // past date and this test to fail (0 overrides instead of 1). Pre-
    // existing "stale expectation" bug, unrelated to any Phase 24/25 work.
    await json(`${server.baseUrl}/umpire/availability/date`, {
      method: 'PATCH',
      token: umpire.token,
      body: { date: addDaysToDateStr(groundTodayDateStr(), 30), startTime: '18:00', endTime: '21:00', isAvailable: false },
    })

    const res = await json(`${server.baseUrl}/umpire/availability`, { token: umpire.token })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.weekly, [{ day_of_week: 2, is_available: false }])
    assert.equal(res.data.dateOverrides.length, 1)
    assert.equal(res.data.dateOverrides[0].is_available, false)
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('a successful apply logs an ASSIGNED event, and a successful cancel logs a CANCELLED event', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('event-log')
  try {
    const match = await createMatch(teams, matchAt(19))
    const applied = await apply(server, match.id, umpire.token)
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const afterAssign = await pool.query(`SELECT event_type FROM umpire_assignment_events WHERE umpire_user_id = $1 AND match_id = $2`, [
      umpire.id,
      match.id,
    ])
    assert.deepEqual(
      afterAssign.rows.map((r) => r.event_type),
      ['ASSIGNED'],
    )

    const cancelled = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))

    const afterCancel = await pool.query(
      `SELECT event_type FROM umpire_assignment_events WHERE umpire_user_id = $1 AND match_id = $2 ORDER BY recorded_at`,
      [umpire.id, match.id],
    )
    assert.deepEqual(
      afterCancel.rows.map((r) => r.event_type),
      ['ASSIGNED', 'CANCELLED'],
    )
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
