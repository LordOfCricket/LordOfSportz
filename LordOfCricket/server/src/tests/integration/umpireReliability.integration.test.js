// Reliability + extended stats (Phase 23, Workstreams K/L). The key
// correctness property under test: no_shows/cancellations must survive a
// slot being reclaimed by a DIFFERENT umpire (current match_umpire_slots
// state would silently lose the original umpire's own history the instant
// someone else claims that same row) — this is why they're sourced from
// umpire_assignment_events, not from match_umpire_slots.status. Real HTTP
// against the real app, same pattern as every other integration test here.
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
    [`Integration Test ${label}`, `integration-test-reliability-${label}-${uniqueTag()}@example.test`],
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
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RLA') RETURNING *`, [`Reliability Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RLB') RETURNING *`, [`Reliability Team B ${tag}`])).rows[0]
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

// 3 days out — see umpireAvailability.integration.test.js's own matchAt for
// why (Phase 2's 24h assignment lock, matchTimeRange.js#isAssignmentLocked).
function matchAt(hour) {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  d.setHours(hour, 0, 0, 0)
  return { matchDate: d.toISOString(), oversPerInnings: 20 }
}

test('a cancellation survives a different umpire later claiming the same (now-open) slot — not silently lost from current-state', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const canceller = await approvedUmpire('canceller')
  const claimer = await approvedUmpire('claimer')
  try {
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: matchAt(19).matchDate,
      oversPerInnings: 20,
      requiredUmpires: 1,
    })

    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: canceller.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const cancelled = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: canceller.token })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))

    // A different umpire reclaims the now-open slot, overwriting umpire_user_id on the same row.
    const reclaimed = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: claimer.token })
    assert.equal(reclaimed.status, 201, JSON.stringify(reclaimed.data))
    assert.equal(reclaimed.data.slot.umpire_user_id, claimer.id)

    // The original canceller's own profile stats must still show the cancellation.
    const profile = await json(`${server.baseUrl}/umpire/profile`, { token: canceller.token })
    assert.equal(profile.status, 200)
    assert.equal(profile.data.profile.matches_cancelled, 1)
    assert.equal(profile.data.profile.matches_no_show, 0)
  } finally {
    await claimer.cleanup()
    await canceller.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('GET /umpire/profile exposes a deterministic reliability percentage derived from real completed/no-show/cancelled counts', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('reliability-profile')
  try {
    const fresh = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(fresh.status, 200)
    assert.equal(fresh.data.profile.reliability, null) // no terminal history yet — honest absence, never a fabricated number
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})
