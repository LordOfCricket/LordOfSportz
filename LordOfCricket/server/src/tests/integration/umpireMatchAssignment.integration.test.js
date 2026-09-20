// Phase 21 (U3) — match umpire slot application/assignment and match-scoped
// scorer authorization. Real HTTP against the real app (matching the
// established pattern: canteenOrder.integration.test.js /
// umpireScorerAuthorization.integration.test.js), so the actual middleware
// chain (requireAuth -> requireMatchScorer / the umpire-slots routes) is what
// gets exercised, not just the service layer.
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

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [], staffRoleName = null }) {
  let staffRoleId = null
  if (staffRoleName) {
    staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = $1`, [staffRoleName])).rows[0].id
  }
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4,$5) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u3-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
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
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function makeTeams() {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U3 Test Team A','U3A') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U3 Test Team B','U3B') RETURNING *`)).rows[0]
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

// Default matchDate is 3 days out, not "now" — Phase 2's 24h assignment
// lock (matchTimeRange.js#isAssignmentLocked) gates self-cancel purely on
// match_date vs. real time, independent of the match's `status` column
// (every test here only cares about status='upcoming', not the actual
// date), so a same-instant default would spuriously lock every self-cancel
// test in this file.
async function createMatchWithSlots(teams, requiredUmpires = 1, matchDate = new Date(Date.now() + 3 * 86400000).toISOString()) {
  return matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    venue: 'U3 Test Ground',
    matchDate,
    requiredUmpires,
  })
}

// ---------------------------------------------------------------------------
// Authorization (requireMatchScorer), exercised via PATCH /matches/:id/toss —
// the simplest match-scoped scorer route (minimal body, an 'upcoming' match
// is exactly the state createMatch leaves it in).
// ---------------------------------------------------------------------------

async function attemptToss(server, match, teams, token) {
  return json(`${server.baseUrl}/matches/${match.id}/toss`, {
    method: 'PATCH',
    token,
    body: { tossWinnerId: teams.teamA.id, tossDecision: 'bat' },
  })
}

test('Authorization 1 — approved umpire assigned to the match: allowed', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('auth1')
  try {
    const match = await createMatchWithSlots(teams, 1)
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const { status, data } = await attemptToss(server, match, teams, umpire.token)
    assert.equal(status, 200, JSON.stringify(data))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 2 — approved umpire NOT assigned to the match: 403', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('auth2')
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status } = await attemptToss(server, match, teams, umpire.token)
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 3 — approved umpire assigned to a DIFFERENT match: 403 on this one', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('auth3')
  try {
    const matchA = await createMatchWithSlots(teams, 1)
    const matchB = await createMatchWithSlots(teams, 1)
    const applied = await json(`${server.baseUrl}/matches/${matchA.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const { status } = await attemptToss(server, matchB, teams, umpire.token)
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 4 — pending umpire: 403', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'auth4', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status } = await attemptToss(server, match, teams, umpire.token)
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 5 — rejected umpire: 403', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'auth5', playerType: 'umpire', requestStatuses: ['rejected'] })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status } = await attemptToss(server, match, teams, umpire.token)
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 6 — normal team_player: 403', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const player = await makeUser({ label: 'auth6', playerType: 'team_player' })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status } = await attemptToss(server, match, teams, player.token)
    assert.equal(status, 403)
  } finally {
    await player.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Authorization 7 — super admin: existing behavior preserved regardless of assignment', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const admin = await makeUser({ label: 'auth7', role: 'staff', staffRoleName: 'super_admin' })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status, data } = await attemptToss(server, match, teams, admin.token)
    assert.equal(status, 200, JSON.stringify(data))
  } finally {
    await admin.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

// U3.1 — product rule: LIVE -> assigned umpire can score; COMPLETED (and
// FINALIZED) -> umpire scoring authority revoked. Exercised via
// GET /matches/:matchId/availability, which (unlike toss/deliveries) has no
// service-layer status guard of its own — so a 200 while live / 403 while
// completed here proves requireMatchScorer's OWN status window, not an
// incidental side effect of a downstream service check.
test('U3.1 — a LIVE match still allows the assigned umpire to score', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('live-allowed')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/availability`, { token: umpire.token })
    assert.equal(status, 200, JSON.stringify(data))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('U3.1 — a COMPLETED match revokes the assigned umpire\'s scoring access', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('completed-revoked')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])

    const { status } = await json(`${server.baseUrl}/matches/${match.id}/availability`, { token: umpire.token })
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('U3.1 — the assigned umpire can still finalize a COMPLETED match (the one deliberate exception)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('finalize-exception')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/finalize`, { method: 'POST', token: umpire.token })
    assert.equal(status, 200, JSON.stringify(data))
    assert.equal(data.match.status, 'finalized')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Assignment (apply/cancel)
// ---------------------------------------------------------------------------

test('Assignment 8 — approved umpire can claim an available slot', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign8')
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(status, 201)
    assert.equal(data.slot.status, 'ASSIGNED')
    assert.equal(data.slot.umpire_user_id, umpire.id)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 9 — pending umpire cannot claim a slot', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'assign9', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(status, 403)
    assert.equal(data.code, 'NOT_APPROVED_UMPIRE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 10 — rejected umpire cannot claim a slot', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'assign10', playerType: 'umpire', requestStatuses: ['rejected'] })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(status, 403)
    assert.equal(data.code, 'NOT_APPROVED_UMPIRE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 11 — same umpire cannot claim the same match twice', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign11')
  try {
    const match = await createMatchWithSlots(teams, 2)
    const first = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(first.status, 201)

    const second = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(second.status, 409)
    assert.equal(second.data.code, 'ALREADY_ASSIGNED')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 12 — the same umpire can be assigned to different matches', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign12')
  try {
    // A day apart — the umpire double-booking check (added alongside the
    // ground-owner lifecycle phase) correctly treats two same-instant
    // matches as a real conflict; this test's own point is "no artificial
    // one-assignment-ever restriction exists", which needs two genuinely
    // non-overlapping matches to demonstrate under the new rule.
    const matchA = await createMatchWithSlots(teams, 1)
    const matchB = await createMatchWithSlots(teams, 1, new Date(Date.now() + 86400000).toISOString())
    const a = await json(`${server.baseUrl}/matches/${matchA.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const b = await json(`${server.baseUrl}/matches/${matchB.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 13 — no slot available: conflict', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('assign13a')
  const umpireB = await approvedUmpire('assign13b')
  try {
    const match = await createMatchWithSlots(teams, 1)
    const a = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(a.status, 201)

    const b = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireB.token })
    assert.equal(b.status, 409)
    assert.equal(b.data.code, 'NO_SLOT_AVAILABLE')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 14 — cancellation releases the slot', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign14')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(status, 200, JSON.stringify(data))
    assert.equal(data.slot.status, 'CANCELLED')

    // No longer holds an ACTIVE assignment — the cancelled umpire must not
    // retain scoring authorization.
    const tossAfterCancel = await attemptToss(server, match, teams, umpire.token)
    assert.equal(tossAfterCancel.status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 15 — another umpire can claim a cancelled slot', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('assign15a')
  const umpireB = await approvedUmpire('assign15b')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpireA.token })

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireB.token })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.slot.status, 'ASSIGNED')
    assert.equal(data.slot.umpire_user_id, umpireB.id)
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 16 — cannot cancel another umpire\'s assignment', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('assign16a')
  const umpireB = await approvedUmpire('assign16b')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpireB.token })
    assert.equal(status, 404, JSON.stringify(data))
    assert.equal(data.code, 'ASSIGNMENT_NOT_FOUND')

    // Umpire A's assignment must be completely unaffected by B's attempt.
    const stillAssigned = await attemptToss(server, match, teams, umpireA.token)
    assert.equal(stillAssigned.status, 200)
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment 17 — cannot cancel once the match is no longer eligible', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign17')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(status, 409, JSON.stringify(data))
    assert.equal(data.code, 'MATCH_NOT_ELIGIBLE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('U3.1 — self-cancellation is UPCOMING-only: denied once the match is LIVE', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign-cancel-live')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(status, 409, JSON.stringify(data))
    assert.equal(data.code, 'MATCH_NOT_ELIGIBLE')

    // The assignment itself must be completely unaffected by the denied attempt.
    const { rows } = await pool.query(`SELECT status FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2`, [match.id, umpire.id])
    assert.equal(rows[0].status, 'ASSIGNED')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment — applications close once the match is no longer upcoming', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign-upcoming')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(status, 409, JSON.stringify(data))
    assert.equal(data.code, 'MATCH_NOT_ELIGIBLE')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Assignment — a finalized match denies scoring even to a previously-assigned umpire', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assign-finalized')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'finalized' WHERE id = $1`, [match.id])

    const { status } = await attemptToss(server, match, teams, umpire.token)
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('GET umpire-slots lists real slot state (public shape check)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('list-slots')
  try {
    const match = await createMatchWithSlots(teams, 2)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots`, { token: umpire.token })
    assert.equal(status, 200)
    assert.equal(data.slots.length, 2)
    const filled = data.slots.filter((s) => s.status === 'ASSIGNED')
    assert.equal(filled.length, 1)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

// U3.1 Item 2 — GET /matches/:matchId/availability audit. Investigation (see
// the U3.1 report) found its only real frontend consumer is
// MatchRosterPage.jsx's roster-builder (fetchMatchAvailability), the SAME
// page that does toss/start/roster-setup — never a general player-facing
// page — and its PRE-U3 authorization was already requireScorer (never open
// to normal players). U3's match-scoping was therefore correct, not a
// regression; this is the HTTP regression test that didn't exist before
// (the existing matchAvailability.integration.test.js calls the service
// layer directly and never exercises this route's auth gate at all).
test('U3.1 Item 2 — availability: the assigned umpire (the real roster-builder consumer) can read it', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('avail-consumer')
  try {
    const match = await createMatchWithSlots(teams, 1)
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/availability`, { token: umpire.token })
    assert.equal(status, 200, JSON.stringify(data))
    assert.ok(Array.isArray(data.players))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('U3.1 Item 2 — availability: a normal player (not staff, not an approved umpire) is still denied, matching pre-U3 behavior', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const player = await makeUser({ label: 'avail-normal-player', playerType: 'team_player' })
  try {
    const match = await createMatchWithSlots(teams, 1)
    const { status } = await json(`${server.baseUrl}/matches/${match.id}/availability`, { token: player.token })
    assert.equal(status, 403)
  } finally {
    await player.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Concurrency — the critical invariant: exactly one successful assignment
// for the final available slot, never zero, never two.
// ---------------------------------------------------------------------------

test('Concurrency — two umpires racing for the last slot: exactly one succeeds', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('race-a')
  const umpireB = await approvedUmpire('race-b')
  try {
    const match = await createMatchWithSlots(teams, 1)

    const [a, b] = await Promise.all([
      json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token }),
      json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireB.token }),
    ])

    const statuses = [a.status, b.status].sort()
    assert.deepEqual(statuses, [201, 409], `expected exactly one 201 and one 409, got ${JSON.stringify(statuses)}`)

    const { rows } = await pool.query(`SELECT * FROM match_umpire_slots WHERE match_id = $1 AND status = 'ASSIGNED'`, [match.id])
    assert.equal(rows.length, 1, 'exactly one ASSIGNED slot must exist — never zero, never two')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Concurrency — ten umpires racing for one slot: exactly one succeeds', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpires = await Promise.all(Array.from({ length: 10 }, (_, i) => approvedUmpire(`race10-${i}`)))
  try {
    const match = await createMatchWithSlots(teams, 1)

    const results = await Promise.all(
      umpires.map((u) => json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: u.token })),
    )

    const successCount = results.filter((r) => r.status === 201).length
    const conflictCount = results.filter((r) => r.status === 409).length
    assert.equal(successCount, 1, `expected exactly 1 success, got ${successCount}`)
    assert.equal(conflictCount, 9, `expected exactly 9 conflicts, got ${conflictCount}`)

    const { rows } = await pool.query(`SELECT * FROM match_umpire_slots WHERE match_id = $1 AND status = 'ASSIGNED'`, [match.id])
    assert.equal(rows.length, 1)
  } finally {
    await Promise.all(umpires.map((u) => u.cleanup()))
    await teams.cleanup()
    await server.close()
  }
})
