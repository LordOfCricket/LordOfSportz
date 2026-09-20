// Phase 21 (U9) — a match with unfilled required umpire slots (U8's
// discovered gap) is now a soft warning at start time, not a silent
// allow and not a hard block: starting without confirmUnderstaffed on a
// genuinely understaffed match returns 409 with real fill counts; starting
// with confirmUnderstaffed=true proceeds exactly as before. Real HTTP
// against the real app, same pattern as every prior U-phase test file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import * as matchService from '../../services/match.service.js'
import { addMatchPlayer } from '../../services/scoring.service.js'

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
    [`Integration Test ${label}`, `integration-test-u9-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
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

async function makeTeams(label) {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U9A') RETURNING *`, [`U9 Team A ${label}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U9B') RETURNING *`, [`U9 Team B ${label}`])).rows[0]
  const playerA1 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'U9 A1','Batter') RETURNING *`, [teamA.id])).rows[0]
  const playerA2 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'U9 A2','Batter') RETURNING *`, [teamA.id])).rows[0]
  const playerB1 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'U9 B1','Bowler') RETURNING *`, [teamB.id])).rows[0]
  const playerB2 = (await pool.query(`INSERT INTO players (team_id, name, role) VALUES ($1,'U9 B2','Bowler') RETURNING *`, [teamB.id])).rows[0]
  return {
    teamA,
    teamB,
    players: [playerA1, playerA2, playerB1, playerB2],
    async cleanup(matchId) {
      if (matchId) {
        await pool.query('DELETE FROM match_players WHERE match_id = $1', [matchId])
        await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
        await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
      }
      await pool.query('DELETE FROM players WHERE id = ANY($1)', [[playerA1.id, playerA2.id, playerB1.id, playerB2.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

// Builds a match up to "ready to start" (roster seated, toss set) via the
// real service layer, gated by the given scorer token where the flow
// genuinely requires it — the pieces this test isn't about (roster/toss)
// stay minimal and direct rather than re-deriving the U8 end-to-end test.
async function readyToStartMatch(teams, { requiredUmpires = 0 } = {}) {
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: new Date().toISOString(),
    requiredUmpires,
  })
  const [pA1, pA2, pB1, pB2] = teams.players
  await addMatchPlayer({ matchId: match.id, teamId: teams.teamA.id, playerId: pA1.id, isPlayingXi: true })
  await addMatchPlayer({ matchId: match.id, teamId: teams.teamA.id, playerId: pA2.id, isPlayingXi: true })
  await addMatchPlayer({ matchId: match.id, teamId: teams.teamB.id, playerId: pB1.id, isPlayingXi: true })
  await addMatchPlayer({ matchId: match.id, teamId: teams.teamB.id, playerId: pB2.id, isPlayingXi: true })
  await matchService.setToss(match.id, { tossWinnerId: teams.teamA.id, tossDecision: 'bat' })
  return match
}

test('fully staffed: starts normally with no confirmation needed', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('fully-staffed')
  const umpire = await approvedUmpire('fully-staffed')
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 1 })
    matchId = match.id
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const started = await json(`${server.baseUrl}/matches/${match.id}/start`, { method: 'POST', token: umpire.token })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')
  } finally {
    await umpire.cleanup()
    await teams.cleanup(matchId)
    await server.close()
  }
})

test('understaffed: starting WITHOUT confirmation is blocked with real fill counts, match stays upcoming', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('understaffed-blocked')
  const umpire = await approvedUmpire('understaffed-blocked')
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 2 })
    matchId = match.id
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const started = await json(`${server.baseUrl}/matches/${match.id}/start`, { method: 'POST', token: umpire.token })
    assert.equal(started.status, 409, JSON.stringify(started.data))
    assert.deepEqual(started.data.details, { understaffed: true, filledSlots: 1, totalSlots: 2 })

    const { rows } = await pool.query('SELECT status FROM matches WHERE id = $1', [matchId])
    assert.equal(rows[0].status, 'upcoming', 'the match must NOT have started')
  } finally {
    await umpire.cleanup()
    await teams.cleanup(matchId)
    await server.close()
  }
})

test('understaffed: starting WITH confirmUnderstaffed=true proceeds normally', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('understaffed-confirmed')
  const umpire = await approvedUmpire('understaffed-confirmed')
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 2 })
    matchId = match.id
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const started = await json(`${server.baseUrl}/matches/${match.id}/start`, {
      method: 'POST',
      token: umpire.token,
      body: { confirmUnderstaffed: true },
    })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')
  } finally {
    await umpire.cleanup()
    await teams.cleanup(matchId)
    await server.close()
  }
})

test('completely unstaffed (0 of 2 filled): same block/confirm behavior applies', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('zero-filled')
  const admin = await makeUser({ label: 'zero-filled-admin', role: 'staff', staffRoleName: 'super_admin' })
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 2 })
    matchId = match.id

    const blocked = await json(`${server.baseUrl}/matches/${match.id}/start`, { method: 'POST', token: admin.token })
    assert.equal(blocked.status, 409)
    assert.deepEqual(blocked.data.details, { understaffed: true, filledSlots: 0, totalSlots: 2 })

    const confirmed = await json(`${server.baseUrl}/matches/${match.id}/start`, {
      method: 'POST',
      token: admin.token,
      body: { confirmUnderstaffed: true },
    })
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data))
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id])
    await teams.cleanup(matchId)
    await server.close()
  }
})

test('required_umpires=0: never "understaffed" — starts normally with no confirmation, exactly as before U9', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('zero-required')
  const admin = await makeUser({ label: 'zero-required-admin', role: 'staff', staffRoleName: 'super_admin' })
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 0 })
    matchId = match.id

    const started = await json(`${server.baseUrl}/matches/${match.id}/start`, { method: 'POST', token: admin.token })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id])
    await teams.cleanup(matchId)
    await server.close()
  }
})

test('super_admin can also confirm-override — the same existing authorization, no new permission layer', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('admin-override')
  const admin = await makeUser({ label: 'admin-override', role: 'staff', staffRoleName: 'super_admin' })
  let matchId
  try {
    const match = await readyToStartMatch(teams, { requiredUmpires: 1 })
    matchId = match.id

    const started = await json(`${server.baseUrl}/matches/${match.id}/start`, {
      method: 'POST',
      token: admin.token,
      body: { confirmUnderstaffed: true },
    })
    assert.equal(started.status, 200, JSON.stringify(started.data))
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id])
    await teams.cleanup(matchId)
    await server.close()
  }
})
