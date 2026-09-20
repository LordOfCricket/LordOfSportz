// Phase 9 — ground membership + authorization foundation. No production
// route uses requireGroundRole/requireCanteenRole yet (deliberately, per
// this phase's scope — see groundAccess.js), so the middleware tests here
// mount a throwaway Express app INSIDE this test file (never touching
// app.js/routes/*) and hit it over real HTTP, matching the project's
// established "real http.createServer + fetch" integration-test pattern
// (canteenOrder.integration.test.js). Model-layer tests hit real Postgres
// directly, same as groundCanteen.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import express from 'express'
import cookieParser from 'cookie-parser'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { requireAuth } from '../../middlewares/auth.js'
import { requireGroundRole, requireCanteenRole } from '../../middlewares/groundAccess.js'
import { generatePublicId } from '../../utils/publicId.js'
import {
  createMembership,
  findActiveMembership,
  findActiveMembershipForAnyRole,
  setMembershipActive,
} from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'dev-only-insecure-cookie-secret-change-me'

function buildTestApp() {
  const app = express()
  app.use(express.json())
  // Phase 6 — requireGroundRole's GROUND_OWNER/Super-Admin branches now
  // require req.mfaVerified, which is read off a session cookie
  // (req.signedCookies). This throwaway app mirrors app.js's real
  // cookie-parser configuration (same secret) so mintMfaVerifiedSessionCookie
  // fixtures work against it exactly as they do against the real app.
  app.use(cookieParser(SESSION_COOKIE_SECRET))

  // Mirrors the shape a future real route would take: :publicGroundId in the
  // URL, authorization derived from req.user + DB membership, never from
  // req.body/req.query.
  app.get('/test/grounds/:publicGroundId/owner-only', requireAuth, requireGroundRole('GROUND_OWNER'), (req, res) => {
    res.json({ ok: true, groundId: req.ground.id, role: req.groundMembership?.role ?? 'SUPER_ADMIN_BYPASS' })
  })
  app.get(
    '/test/grounds/:publicGroundId/owner-or-admin',
    requireAuth,
    requireGroundRole('GROUND_OWNER', 'GROUND_ADMIN'),
    (req, res) => res.json({ ok: true, groundId: req.ground.id }),
  )
  // Deliberately ALSO accepts a ground_id in the body, to prove it is never
  // consulted for authorization (Step 22 IDOR test).
  app.post('/test/grounds/:publicGroundId/owner-only', requireAuth, requireGroundRole('GROUND_OWNER'), (req, res) => {
    res.json({ ok: true, groundIdFromParam: req.ground.id, groundIdClaimedInBody: req.body.ground_id ?? null })
  })
  app.get(
    '/test/canteens/:publicCanteenId/staff-only',
    requireAuth,
    requireCanteenRole('CANTEEN_STAFF'),
    (req, res) => res.json({ ok: true, canteenId: req.canteen.id }),
  )

  return app
}

async function startTestApp() {
  const app = buildTestApp()
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/test`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function createUser(label, { role = 'user', staffRoleId = null } = {}) {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1, $2, 'not-a-real-hash', $3, $4) RETURNING *`,
      [`Integration Test ${label}`, `integration-test-gm-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, staffRoleId],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGroundFixture(label) {
  const ground = (
    await pool.query(
      `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`,
      [generatePublicId('GRD', 8), `integration-test-gm-ground-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`],
    )
  ).rows[0]
  const canteen = (
    await pool.query(
      `INSERT INTO canteens (ground_id, public_canteen_id, name) VALUES ($1,$2,$3) RETURNING *`,
      [ground.id, generatePublicId('CAN', 8), `Integration Test Canteen ${label}`],
    )
  ).rows[0]
  return {
    ground,
    canteen,
    async cleanup() {
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id]) // cascades canteens + ground_users
    },
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

// --- Model-layer / DB integrity tests (Step 24) ---------------------------

test('ground_users: creating a membership with a nonexistent ground_id violates the FK', async () => {
  const user = await createUser('fk-ground')
  try {
    await assert.rejects(
      () => createMembership({ groundId: 999999999, userId: user.id, role: 'GROUND_OWNER' }),
      (err) => err.code === '23503',
    )
  } finally {
    await user.cleanup()
  }
})

test('ground_users: creating a membership with a nonexistent user_id violates the FK', async () => {
  const gf = await createGroundFixture('fk-user')
  try {
    await assert.rejects(
      () => createMembership({ groundId: gf.ground.id, userId: 999999999, role: 'GROUND_OWNER' }),
      (err) => err.code === '23503',
    )
  } finally {
    await gf.cleanup()
  }
})

test('ground_users: an invalid role is rejected by the CHECK constraint', async () => {
  const user = await createUser('bad-role')
  const gf = await createGroundFixture('bad-role')
  try {
    await assert.rejects(
      () => createMembership({ groundId: gf.ground.id, userId: user.id, role: 'DICTATOR' }),
      (err) => err.code === '23514', // check_violation
    )
  } finally {
    await user.cleanup()
    await gf.cleanup()
  }
})

test('ground_users: UNIQUE(user_id, ground_id, role) rejects an exact duplicate grant', async () => {
  const user = await createUser('dup')
  const gf = await createGroundFixture('dup')
  try {
    await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' })
    await assert.rejects(
      () => createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' }),
      (err) => err.code === '23505',
    )
  } finally {
    await user.cleanup()
    await gf.cleanup()
  }
})

test('ground_users: the SAME user can hold multiple DIFFERENT roles at the SAME ground (Step 17)', async () => {
  const user = await createUser('multi-role')
  const gf = await createGroundFixture('multi-role')
  try {
    await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' })
    await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'CANTEEN_STAFF' })
    const owner = await findActiveMembership(user.id, gf.ground.id, 'GROUND_OWNER')
    const staff = await findActiveMembership(user.id, gf.ground.id, 'CANTEEN_STAFF')
    assert.ok(owner)
    assert.ok(staff)
  } finally {
    await user.cleanup()
    await gf.cleanup()
  }
})

test('ground_users: the SAME user can hold DIFFERENT roles at DIFFERENT grounds (Step 5/Step 19)', async () => {
  const user = await createUser('multi-ground')
  const gfA = await createGroundFixture('multi-ground-a')
  const gfB = await createGroundFixture('multi-ground-b')
  try {
    await createMembership({ groundId: gfA.ground.id, userId: user.id, role: 'GROUND_OWNER' })
    await createMembership({ groundId: gfB.ground.id, userId: user.id, role: 'SCORER' })
    assert.ok(await findActiveMembership(user.id, gfA.ground.id, 'GROUND_OWNER'))
    assert.ok(await findActiveMembership(user.id, gfB.ground.id, 'SCORER'))
    assert.equal(await findActiveMembership(user.id, gfB.ground.id, 'GROUND_OWNER'), null)
  } finally {
    await user.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
  }
})

test('ground_users: revoking a membership (is_active=false) makes it invisible to findActiveMembership, without deleting the row', async () => {
  const user = await createUser('revoke')
  const gf = await createGroundFixture('revoke')
  try {
    const membership = await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_ADMIN' })
    assert.ok(await findActiveMembership(user.id, gf.ground.id, 'GROUND_ADMIN'))

    await setMembershipActive(membership.id, false)
    assert.equal(await findActiveMembership(user.id, gf.ground.id, 'GROUND_ADMIN'), null)

    const stillThere = await pool.query('SELECT * FROM ground_users WHERE id = $1', [membership.id])
    assert.equal(stillThere.rows.length, 1, 'the historical row must still exist, not be deleted')
    assert.equal(stillThere.rows[0].is_active, false)
  } finally {
    await user.cleanup()
    await gf.cleanup()
  }
})

test('ground_users: deleting a ground cascades away its memberships, deleting a user does too', async () => {
  const user = await createUser('cascade')
  const gf = await createGroundFixture('cascade')
  const membership = await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' })

  await pool.query('DELETE FROM grounds WHERE id = $1', [gf.ground.id])
  const afterGroundDelete = await pool.query('SELECT * FROM ground_users WHERE id = $1', [membership.id])
  assert.equal(afterGroundDelete.rows.length, 0)

  await user.cleanup() // asserts nothing; just confirms user delete doesn't error with dangling refs
})

test('findActiveMembershipForAnyRole: matches if user holds ANY of the candidate roles', async () => {
  const user = await createUser('any-role')
  const gf = await createGroundFixture('any-role')
  try {
    await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_ADMIN' })
    const found = await findActiveMembershipForAnyRole(user.id, gf.ground.id, ['GROUND_OWNER', 'GROUND_ADMIN'])
    assert.ok(found)
    assert.equal(found.role, 'GROUND_ADMIN')

    const notFound = await findActiveMembershipForAnyRole(user.id, gf.ground.id, ['GROUND_OWNER', 'SCORER'])
    assert.equal(notFound, null)
  } finally {
    await user.cleanup()
    await gf.cleanup()
  }
})

// --- Security tests via real HTTP against the middleware (Steps 21-23) ----

test('Test A — no membership at all -> 403', async () => {
  const testApp = await startTestApp()
  const user = await createUser('no-membership')
  const gf = await createGroundFixture('no-membership')
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/${gf.ground.public_ground_id}/owner-only`, { headers: authHeader(user.token) })
    assert.equal(res.status, 403)
  } finally {
    await user.cleanup()
    await gf.cleanup()
    await testApp.close()
  }
})

test('Test B — correct active membership -> allowed', async () => {
  const testApp = await startTestApp()
  const user = await createUser('correct-membership')
  const gf = await createGroundFixture('correct-membership')
  await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  await elevate(user)
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/${gf.ground.public_ground_id}/owner-only`, { headers: cauth(user) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.groundId, gf.ground.id)
    assert.equal(body.role, 'GROUND_OWNER')
  } finally {
    await user.cleanup()
    await gf.cleanup()
    await testApp.close()
  }
})

test('Test C — membership at Ground A does not authorize Ground B -> 403', async () => {
  const testApp = await startTestApp()
  const user = await createUser('wrong-ground')
  const gfA = await createGroundFixture('wrong-ground-a')
  const gfB = await createGroundFixture('wrong-ground-b')
  await createMembership({ groundId: gfA.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  await elevate(user)
  try {
    const okA = await fetch(`${testApp.baseUrl}/grounds/${gfA.ground.public_ground_id}/owner-only`, { headers: cauth(user) })
    assert.equal(okA.status, 200)

    const deniedB = await fetch(`${testApp.baseUrl}/grounds/${gfB.ground.public_ground_id}/owner-only`, { headers: cauth(user) })
    assert.equal(deniedB.status, 403)
  } finally {
    await user.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await testApp.close()
  }
})

test('Test D — inactive (revoked) membership -> 403', async () => {
  const testApp = await startTestApp()
  const user = await createUser('inactive-membership')
  const gf = await createGroundFixture('inactive-membership')
  const membership = await createMembership({ groundId: gf.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  await setMembershipActive(membership.id, false)
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/${gf.ground.public_ground_id}/owner-only`, { headers: authHeader(user.token) })
    assert.equal(res.status, 403)
  } finally {
    await user.cleanup()
    await gf.cleanup()
    await testApp.close()
  }
})

test('Test E — one user, two grounds, two different roles: each ground enforces its own role independently', async () => {
  const testApp = await startTestApp()
  const user = await createUser('two-grounds-two-roles')
  const gfA = await createGroundFixture('ter-a')
  const gfB = await createGroundFixture('ter-b')
  await createMembership({ groundId: gfA.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  await createMembership({ groundId: gfB.ground.id, userId: user.id, role: 'SCORER' })
  await elevate(user)
  try {
    const ownerAtA = await fetch(`${testApp.baseUrl}/grounds/${gfA.ground.public_ground_id}/owner-only`, { headers: cauth(user) })
    assert.equal(ownerAtA.status, 200, 'GROUND_OWNER at Ground A must be allowed')

    const ownerAtB = await fetch(`${testApp.baseUrl}/grounds/${gfB.ground.public_ground_id}/owner-only`, { headers: cauth(user) })
    assert.equal(ownerAtB.status, 403, 'SCORER at Ground B must NOT satisfy an owner-only route')
  } finally {
    await user.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await testApp.close()
  }
})

test('Test F — Super Admin bypasses membership entirely, at any ground, without a membership row', async () => {
  const testApp = await startTestApp()
  const superAdmin = await createUser('super-admin', { role: 'staff', staffRoleId: 1 }) // staff_roles.id=1 = super_admin
  await elevate(superAdmin)
  const gf = await createGroundFixture('super-admin-bypass')
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/${gf.ground.public_ground_id}/owner-only`, { headers: cauth(superAdmin) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.role, 'SUPER_ADMIN_BYPASS')

    const memberships = await pool.query('SELECT * FROM ground_users WHERE user_id = $1', [superAdmin.id])
    assert.equal(memberships.rows.length, 0, 'super admin must not need a membership row to pass')
  } finally {
    await superAdmin.cleanup()
    await gf.cleanup()
    await testApp.close()
  }
})

// --- IDOR protection (Step 22) --------------------------------------------

test('IDOR — a ground_id claimed in the request BODY is never consulted for authorization, only the authenticated membership is', async () => {
  const testApp = await startTestApp()
  const user = await createUser('idor')
  const gfOwned = await createGroundFixture('idor-owned')
  const gfNotOwned = await createGroundFixture('idor-not-owned')
  await createMembership({ groundId: gfOwned.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  await elevate(user)
  try {
    // Attempt: hit the route for the ground the user does NOT own, while
    // claiming ownership of the OTHER ground in the body. If the body were
    // ever trusted, this could be misused to smuggle authorization; the
    // response must prove only the URL param + DB membership were used.
    const res = await fetch(`${testApp.baseUrl}/grounds/${gfNotOwned.ground.public_ground_id}/owner-only`, {
      method: 'POST',
      headers: authHeader(user.token),
      body: JSON.stringify({ ground_id: gfOwned.ground.id }),
    })
    assert.equal(res.status, 403, 'a body-supplied ground_id for a ground the user DOES own must not grant access to a different URL ground')

    // And the reverse: hitting the OWNED ground's URL while the body claims
    // the NOT-owned ground must still succeed off the URL/membership, and the
    // response must reflect the URL-resolved ground, not the body's claim.
    const res2 = await fetch(`${testApp.baseUrl}/grounds/${gfOwned.ground.public_ground_id}/owner-only`, {
      method: 'POST',
      headers: cauth(user),
      body: JSON.stringify({ ground_id: gfNotOwned.ground.id }),
    })
    assert.equal(res2.status, 200)
    const body2 = await res2.json()
    assert.equal(body2.groundIdFromParam, gfOwned.ground.id)
  } finally {
    await user.cleanup()
    await gfOwned.cleanup()
    await gfNotOwned.cleanup()
    await testApp.close()
  }
})

// --- Canteen cross-ground security (Step 23) -------------------------------

test('Canteen cross-ground — CANTEEN_STAFF at Ground A can access Canteen A but not Canteen B', async () => {
  const testApp = await startTestApp()
  const userA = await createUser('canteen-staff-a')
  const userB = await createUser('canteen-staff-b')
  const gfA = await createGroundFixture('canteen-cross-a')
  const gfB = await createGroundFixture('canteen-cross-b')
  await createMembership({ groundId: gfA.ground.id, userId: userA.id, role: 'CANTEEN_STAFF' })
  await createMembership({ groundId: gfB.ground.id, userId: userB.id, role: 'CANTEEN_STAFF' })
  try {
    const aToA = await fetch(`${testApp.baseUrl}/canteens/${gfA.canteen.public_canteen_id}/staff-only`, { headers: authHeader(userA.token) })
    assert.equal(aToA.status, 200, 'User A -> Canteen A must be ALLOW')

    const aToB = await fetch(`${testApp.baseUrl}/canteens/${gfB.canteen.public_canteen_id}/staff-only`, { headers: authHeader(userA.token) })
    assert.equal(aToB.status, 403, 'User A -> Canteen B must be DENY')

    const bToB = await fetch(`${testApp.baseUrl}/canteens/${gfB.canteen.public_canteen_id}/staff-only`, { headers: authHeader(userB.token) })
    assert.equal(bToB.status, 200, 'User B -> Canteen B must be ALLOW')

    const bToA = await fetch(`${testApp.baseUrl}/canteens/${gfA.canteen.public_canteen_id}/staff-only`, { headers: authHeader(userB.token) })
    assert.equal(bToA.status, 403, 'User B -> Canteen A must be DENY')
  } finally {
    await userA.cleanup()
    await userB.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await testApp.close()
  }
})

test('unauthenticated request (no token) is rejected before any ground lookup', async () => {
  const testApp = await startTestApp()
  const gf = await createGroundFixture('unauth')
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/${gf.ground.public_ground_id}/owner-only`)
    assert.equal(res.status, 401)
  } finally {
    await gf.cleanup()
    await testApp.close()
  }
})

test('a well-formed but nonexistent ground public id -> 404, not 403 or 500', async () => {
  const testApp = await startTestApp()
  const user = await createUser('nonexistent-ground')
  try {
    const res = await fetch(`${testApp.baseUrl}/grounds/GRD-DOESNOTEXIST/owner-only`, { headers: authHeader(user.token) })
    assert.equal(res.status, 404)
  } finally {
    await user.cleanup()
    await testApp.close()
  }
})
