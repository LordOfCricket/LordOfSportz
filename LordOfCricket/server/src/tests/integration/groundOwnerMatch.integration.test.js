// Phase 21 (U5) — Ground Owner match management. Real HTTP against the real
// app (same pattern as every prior U-phase test file), so requireGroundRole
// and the ownership-scoped queries are actually exercised, not bypassed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
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

// Phase 6 — requireGroundPermission's GROUND_OWNER branch (MATCH_VIEW/
// MATCH_MANAGE on .../matches) now requires req.mfaVerified, which a bare
// JWT can never satisfy. `elevate` mints a REAL, already-MFA-verified
// session cookie for a user already created via createUser — see
// helpers/mfaFixtures.js for why this skips the TOTP ceremony (this file
// isn't testing MFA, only ground-owner match management). Routes reached
// only via a FAILED membership lookup (cross-ground/no-membership/wrong-role
// tests) never reach the MFA check at all, so those keep the plain JWT.
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-go-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    const decidedAt = umpireRequestStatus === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, umpireRequestStatus, decidedAt])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label, { status = 'ACTIVE' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,$4) RETURNING *`,
    [generatePublicId('GRD', 8), `integration-test-go-ground-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`, status],
  )
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams(label) {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U5A') RETURNING *`, [`U5 Team A ${label}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U5B') RETURNING *`, [`U5 Team B ${label}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('owner can view own ground in "my grounds" with real stats', async () => {
  const server = await startTestApp()
  const gf = await createGround('list-own')
  const owner = await createUser('list-own')
  const teams = await makeTeams('list-own')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 2,
    })

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds`, { token: owner.token })
    assert.equal(status, 200)
    const mine = data.grounds.find((g) => g.id === gf.ground.id)
    assert.ok(mine, 'owned ground must appear')
    assert.equal(mine.upcomingMatchesCount, 1)
    assert.equal(mine.umpireSlotsTotal, 2)
    assert.equal(mine.umpireSlotsFilled, 0)
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('owner can view own ground\'s matches', async () => {
  const server = await startTestApp()
  const gf = await createGround('list-matches')
  const owner = await createUser('list-matches')
  const teams = await makeTeams('list-matches')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    await elevate(owner)
    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { cookie: owner.cookie })
    assert.equal(status, 200)
    assert.equal(data.matches.length, 1)
    assert.equal(data.matches[0].id, match.id)
    assert.equal(data.matches[0].total_slots, 1)
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('owner CANNOT view another ground\'s matches, even by changing the URL', async () => {
  const server = await startTestApp()
  const gfA = await createGround('secA')
  const gfB = await createGround('secB')
  const ownerA = await createUser('secA')
  const teams = await makeTeams('sec')
  try {
    await createMembership({ groundId: gfA.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })
    await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gfB.ground.id,
      requiredUmpires: 1,
    })

    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gfB.ground.public_ground_id}/matches`, { token: ownerA.token })
    assert.equal(status, 403)
  } finally {
    await ownerA.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('owner CANNOT create a match for another ground by sending its id in the URL', async () => {
  const server = await startTestApp()
  const gfA = await createGround('createSecA')
  const gfB = await createGround('createSecB')
  const ownerA = await createUser('createSecA')
  const teams = await makeTeams('createSec')
  try {
    await createMembership({ groundId: gfA.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })

    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gfB.ground.public_ground_id}/matches`, {
      method: 'POST',
      token: ownerA.token,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString(), requiredUmpires: 1 },
    })
    assert.equal(status, 403)

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM matches WHERE ground_id = $1', [gfB.ground.id])
    assert.equal(rows[0].n, 0, 'no match must have been created for the ground the owner does not own')
  } finally {
    await ownerA.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('owner CAN create a match for their own ground; it gets the correct ground_id and real slot rows', async () => {
  const server = await startTestApp()
  const gf = await createGround('create-own')
  const owner = await createUser('create-own')
  const teams = await makeTeams('create-own')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString(), requiredUmpires: 3 },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.match.ground_id, gf.ground.id)
    assert.equal(data.match.venue, gf.ground.name)

    const { rows } = await pool.query('SELECT * FROM match_umpire_slots WHERE match_id = $1 ORDER BY slot_number', [data.match.id])
    assert.equal(rows.length, 3, 'required_umpires=3 must create exactly 3 slot rows')
    assert.ok(rows.every((r) => r.status === 'AVAILABLE'))
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

// U8 hardening regression — createGroundMatch used to silently drop
// oversPerInnings/ballsPerOver entirely, so every ground-owner-created
// match got oversPerInnings=NULL ("no overs limit"), making it impossible
// for an innings to ever auto-complete from a real over count. Found by
// U8's end-to-end lifecycle test actually playing a match out.
test('owner-created match honors oversPerInnings/ballsPerOver when provided', async () => {
  const server = await startTestApp()
  const gf = await createGround('overs-format')
  const owner = await createUser('overs-format')
  const teams = await makeTeams('overs-format')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: {
        teamAId: teams.teamA.id,
        teamBId: teams.teamB.id,
        matchDate: new Date(Date.now() + 86400000).toISOString(),
        requiredUmpires: 0,
        oversPerInnings: 5,
        ballsPerOver: 6,
      },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.match.overs_per_innings, 5)
    assert.equal(data.match.balls_per_over, 6)
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('owner-created match omitting oversPerInnings keeps the prior (unlimited) default — no forced behavior change', async () => {
  const server = await startTestApp()
  const gf = await createGround('overs-format-omitted')
  const owner = await createUser('overs-format-omitted')
  const teams = await makeTeams('overs-format-omitted')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString(), requiredUmpires: 0 },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.match.overs_per_innings, null)
    assert.equal(data.match.balls_per_over, 6, 'ballsPerOver still defaults to 6 exactly as match.service.js already did')
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('cannot create a match for a DRAFT (not yet ACTIVE) ground', async () => {
  const server = await startTestApp()
  const gf = await createGround('draft-ground', { status: 'DRAFT' })
  const owner = await createUser('draft-ground')
  const teams = await makeTeams('draft-ground')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString(), requiredUmpires: 1 },
    })
    assert.equal(status, 400, JSON.stringify(data))
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('existing POST /matches behavior remains intact (unaffected by U5)', async () => {
  const server = await startTestApp()
  const staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)).rows[0].id
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test U5 Admin', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
    [`integration-test-go-admin-${Date.now()}@example.test`, staffRoleId],
  )
  const admin = { id: rows[0].id, token: signToken({ id: rows[0].id }) }
  await elevate(admin)
  const teams = await makeTeams('legacy')
  try {
    const { status, data } = await json(`${server.baseUrl}/matches`, {
      method: 'POST',
      cookie: admin.cookie,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString() },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.match.ground_id, null, 'a legacy-style creation with no groundId must still work exactly as before')
    await pool.query('DELETE FROM matches WHERE id = $1', [data.match.id])
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id])
    await teams.cleanup()
    await server.close()
  }
})

test('two grounds owned by the same user are both independently manageable', async () => {
  const server = await startTestApp()
  const gfA = await createGround('multi-A')
  const gfB = await createGround('multi-B')
  const owner = await createUser('multi')
  try {
    await createMembership({ groundId: gfA.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await createMembership({ groundId: gfB.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const { status, data } = await json(`${server.baseUrl}/ground-owner/grounds`, { token: owner.token })
    assert.equal(status, 200)
    const ids = data.grounds.map((g) => g.id)
    assert.ok(ids.includes(gfA.ground.id) && ids.includes(gfB.ground.id), 'both owned grounds must appear')

    const a = await json(`${server.baseUrl}/ground-owner/grounds/${gfA.ground.public_ground_id}/matches`, { cookie: owner.cookie })
    const b = await json(`${server.baseUrl}/ground-owner/grounds/${gfB.ground.public_ground_id}/matches`, { cookie: owner.cookie })
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
  } finally {
    await owner.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await server.close()
  }
})

test('a user with no membership anywhere cannot access a ground they do not own', async () => {
  const server = await startTestApp()
  const gf = await createGround('no-membership')
  const stranger = await createUser('no-membership')
  try {
    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { token: stranger.token })
    assert.equal(status, 403)
  } finally {
    await stranger.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('security: a normal player cannot access Ground Owner endpoints', async () => {
  const server = await startTestApp()
  const gf = await createGround('sec-player')
  const player = await createUser('sec-player', { playerType: 'team_player' })
  try {
    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { token: player.token })
    assert.equal(status, 403)
  } finally {
    await player.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('security: an approved umpire (no ground membership) cannot access Ground Owner endpoints', async () => {
  const server = await startTestApp()
  const gf = await createGround('sec-umpire')
  const umpire = await createUser('sec-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { token: umpire.token })
    assert.equal(status, 403, 'Approved Umpire != Ground Owner')
  } finally {
    await umpire.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('security: an approved umpire still cannot create matches under the ground-owner routes (creation permission is unchanged for umpires)', async () => {
  const server = await startTestApp()
  const gf = await createGround('sec-umpire-create')
  const umpire = await createUser('sec-umpire-create', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams('sec-umpire-create')
  try {
    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, {
      method: 'POST',
      token: umpire.token,
      body: { teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 86400000).toISOString(), requiredUmpires: 1 },
    })
    assert.equal(status, 403)
  } finally {
    await umpire.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('security: staff (non-super_admin) behavior is unchanged — no ground membership means no access', async () => {
  const server = await startTestApp()
  const gf = await createGround('sec-staff')
  const adminRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'admin'`)).rows[0].id
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test U5 Staff', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
    [`integration-test-go-staff-${Date.now()}@example.test`, adminRoleId],
  )
  const staff = { id: rows[0].id, token: signToken({ id: rows[0].id }) }
  try {
    const { status } = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { token: staff.token })
    assert.equal(status, 403)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [staff.id])
    await gf.cleanup()
    await server.close()
  }
})
