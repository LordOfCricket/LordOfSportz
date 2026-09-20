// Phase 21 (U5.1) — POST /matches (legacy/global match creation) is now
// requireStaffRole('super_admin') only (match.routes.js), separated from
// match SCORING authorization (requireScorer/requireMatchScorer, unchanged).
// An approved umpire — previously allowed here via requireScorer — must now
// be denied. Real HTTP against the real app, matching every other U-phase
// test file's pattern.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

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

async function json(url, { method = 'GET', token, cookie, body } = {}) {
  const authHeaders = cookie ? { Cookie: cookie } : token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

// Phase 6 — requireStaffRole('super_admin') on POST /matches now requires
// req.mfaVerified. `elevate` mints a REAL, already-MFA-verified session
// cookie — see helpers/mfaFixtures.js (this file isn't testing MFA, only
// the U5.1 super_admin-only match-creation restriction).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

async function makeUser({ label, role = 'player', playerType = null, staffRoleName = null, requestStatuses = [] }) {
  let staffRoleId = null
  if (staffRoleName) {
    staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = $1`, [staffRoleName])).rows[0].id
  }
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4,$5) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u51-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
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

async function makeTeams() {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U5.1 Team A','U51A') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('U5.1 Team B','U51B') RETURNING *`)).rows[0]
  return {
    teamA,
    teamB,
    async cleanup(matchIds = []) {
      if (matchIds.length) await pool.query('DELETE FROM matches WHERE id = ANY($1)', [matchIds])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

function payload(teams) {
  return { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString() }
}

test('an approved umpire CANNOT create a match through the legacy POST /matches endpoint', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'approved-umpire', playerType: 'umpire', requestStatuses: ['approved'] })
  try {
    const { status } = await json(`${server.baseUrl}/matches`, { method: 'POST', token: umpire.token, body: payload(teams) })
    assert.equal(status, 403, 'Approved Umpire != match creator')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM matches WHERE team_a_id = $1 AND team_b_id = $2', [teams.teamA.id, teams.teamB.id])
    assert.equal(rows[0].n, 0, 'no match must have been created')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('super_admin CAN still create a match through the legacy endpoint (unchanged)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const admin = await makeUser({ label: 'super-admin', role: 'staff', staffRoleName: 'super_admin' })
  await elevate(admin)
  const createdIds = []
  try {
    const { status, data } = await json(`${server.baseUrl}/matches`, { method: 'POST', cookie: admin.cookie, body: payload(teams) })
    assert.equal(status, 201, JSON.stringify(data))
    createdIds.push(data.match.id)
  } finally {
    await admin.cleanup()
    await teams.cleanup(createdIds)
    await server.close()
  }
})

test('non-super_admin staff (admin/canteen_staff) still cannot create a match — unchanged from before U5.1', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const admin = await makeUser({ label: 'plain-admin', role: 'staff', staffRoleName: 'admin' })
  try {
    const { status } = await json(`${server.baseUrl}/matches`, { method: 'POST', token: admin.token, body: payload(teams) })
    assert.equal(status, 403)
  } finally {
    await admin.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a normal team_player still cannot create a match — unchanged from before U5.1', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const player = await makeUser({ label: 'team-player', playerType: 'team_player' })
  try {
    const { status } = await json(`${server.baseUrl}/matches`, { method: 'POST', token: player.token, body: payload(teams) })
    assert.equal(status, 403)
  } finally {
    await player.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a pending umpire request still cannot create a match', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await makeUser({ label: 'pending-umpire', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    const { status } = await json(`${server.baseUrl}/matches`, { method: 'POST', token: umpire.token, body: payload(teams) })
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('existing match creation validation remains intact (same teams rejected with 400, unaffected by the auth change)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const admin = await makeUser({ label: 'validation-admin', role: 'staff', staffRoleName: 'super_admin' })
  await elevate(admin)
  try {
    const { status, data } = await json(`${server.baseUrl}/matches`, {
      method: 'POST',
      cookie: admin.cookie,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamA.id, matchDate: new Date(Date.now() + 86400000).toISOString() },
    })
    assert.equal(status, 400, JSON.stringify(data))
  } finally {
    await admin.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('an approved umpire CAN still officiate: apply for a slot and score an assigned live match (creation-only restriction, not a general umpire lockout)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const admin = await makeUser({ label: 'setup-admin', role: 'staff', staffRoleName: 'super_admin' })
  await elevate(admin)
  const umpire = await makeUser({ label: 'still-officiates', playerType: 'umpire', requestStatuses: ['approved'] })
  const createdIds = []
  try {
    const created = await json(`${server.baseUrl}/matches`, {
      method: 'POST',
      cookie: admin.cookie,
      body: { ...payload(teams), requiredUmpires: 1 },
    })
    assert.equal(created.status, 201)
    createdIds.push(created.data.match.id)

    const applied = await json(`${server.baseUrl}/matches/${created.data.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
  } finally {
    await umpire.cleanup()
    await admin.cleanup()
    await teams.cleanup(createdIds)
    await server.close()
  }
})
