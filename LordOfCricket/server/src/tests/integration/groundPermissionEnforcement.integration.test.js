// Phase 5 — the full route x permission matrix for groundOwner.routes.js:
// for every permission-gated route, a staff member WITHOUT the required
// permission is denied (403) and WITH it is NOT denied (the middleware let
// the request reach the controller — what the controller then does with a
// nonexistent matchId/slotId is that controller's own concern, already
// covered by groundOwnerMatch*/phase23EndToEnd tests, not re-verified here).
// Also: Owner passes every route with zero explicit grants, Super Admin
// bypasses entirely, and a staff member from a DIFFERENT ground is denied
// on every route (cross-ground isolation) regardless of grants on their own
// ground. Real HTTP, real Postgres — same harness as
// groundStaffPermission.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie, mintStepUpGrant } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', staffRoleId = null } = {}) {
  const tag = uniqueTag()
  const user = (
    await pool.query(`INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`, [
      `Integration Test ${label}`, `perm-matrix-${label}-${tag}@example.test`, role, staffRoleId,
    ])
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM staff_permissions WHERE ground_user_id IN (SELECT id FROM ground_users WHERE user_id = $1)', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('UPDATE account_audit_log SET actor_user_id = NULL WHERE actor_user_id = $1', [user.id])
      await pool.query('UPDATE account_audit_log SET target_user_id = NULL WHERE target_user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// Phase 6 — requireGroundRole('GROUND_OWNER')/requireGroundPermission's
// Owner+Super-Admin branches now require req.mfaVerified. `elevate` mints a
// REAL, already-MFA-verified session cookie — see
// helpers/mfaFixtures.js for why this skips the TOTP ceremony (this file
// isn't testing MFA, only the permission matrix). None of the routes in
// this matrix are step-up-gated, so no step-up grant is needed anywhere.
async function elevate(user) {
  const { cookie, sessionId } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  user.sessionId = sessionId
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

async function createOwnedGround(owner, superAdmin, server, tag) {
  const submitRes = await fetch(`${server.baseUrl}/grounds`, {
    method: 'POST',
    headers: auth(owner.token),
    body: JSON.stringify({
      name: `Perm Matrix Ground ${tag}`,
      description: 'A test ground for permission enforcement fixtures.',
      addressLine: '1 Rd',
      city: 'City',
      state: 'State',
      phone: '9999999999',
      agreedToTerms: true,
      featuredPhotos: Array.from({ length: 6 }, (_, i) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/perm-${tag}-${i}.jpg`, publicId: `perm-${tag}-${i}` })),
    }),
  })
  const publicRequestId = (await submitRes.json()).request.publicRequestId
  if (!superAdmin.cookie) await elevate(superAdmin)
  // Ground Approval MFA removal (2026-08-24) — approve no longer requires a
  // step-up grant, so this helper no longer mints one (also avoids
  // idx_step_up_grants_active collisions when called more than once per
  // superAdmin session in one test).
  const approveRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cauth(superAdmin) })
  return (await approveRes.json()).ground
}

async function createGroundStaff(server, owner, ground) {
  if (!owner.cookie) await elevate(owner)
  const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
    method: 'POST',
    headers: cauth(owner),
    body: JSON.stringify({ name: 'Matrix Staff', identifier: `perm-matrix-member-${uniqueTag()}@example.test`, role: 'GROUND_ADMIN' }),
  })
  return res.json()
}

async function grant(server, owner, ground, membershipId, permissionKey) {
  if (!owner.cookie) await elevate(owner)
  await mintStepUpGrant(owner.sessionId, owner.id, 'PERMISSION_GRANT')
  await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions`, {
    method: 'POST',
    headers: cauth(owner),
    body: JSON.stringify({ permissionKey }),
  })
}

// Idempotent — 404 (already not granted) is expected and fine, this is
// only ever used to guarantee a clean "definitely does not have it yet"
// starting point before each route's own before/after check, since several
// routes intentionally share the same permission key. Revoke is never
// step-up-gated.
async function revokeIfPresent(server, owner, ground, membershipId, permissionKey) {
  if (!owner.cookie) await elevate(owner)
  await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions/${permissionKey}`, {
    method: 'DELETE',
    headers: cauth(owner),
  })
}

async function cleanupGround(ground) {
  if (!ground) return
  const row = (await pool.query('SELECT id FROM grounds WHERE public_ground_id = $1', [ground.publicGroundId])).rows[0]
  if (!row) return
  const requestRow = (await pool.query('SELECT id FROM ground_owner_requests WHERE created_ground_id = $1', [row.id])).rows[0]
  await pool.query('DELETE FROM staff_permissions WHERE ground_user_id IN (SELECT id FROM ground_users WHERE ground_id = $1)', [row.id])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [row.id])
  // Ground Registration feature — approval now copies the request's 6
  // featured photos and any selected amenities into ground_photos/
  // ground_amenities, which didn't happen before and so this cleanup never
  // needed to account for it.
  await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [row.id])
  await pool.query('DELETE FROM ground_amenities WHERE ground_id = $1', [row.id])
  if (requestRow) {
    await pool.query('DELETE FROM account_audit_log WHERE target_request_id = $1', [requestRow.id])
    await pool.query('DELETE FROM ground_owner_requests WHERE id = $1', [requestRow.id])
  }
  await pool.query('DELETE FROM grounds WHERE id = $1', [row.id])
}

const FAKE_ID = 999999999

// One entry per permission-gated groundOwner.routes.js route (excludes the
// two owner-only routes — GET /grounds has no ground-role gate at all, and
// POST staff/permissions/disable are covered by
// groundStaffPermission.integration.test.js's escalation tests instead).
const ROUTES = [
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches` },
  { method: 'POST', permission: 'MATCH_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches`, body: {} },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots` },
  { method: 'POST', permission: 'MATCH_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/start`, body: {} },
  { method: 'POST', permission: 'MATCH_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/complete`, body: {} },
  { method: 'POST', permission: 'UMPIRE_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots/${FAKE_ID}/no-show`, body: {} },
  { method: 'GET', permission: 'UMPIRE_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots/${FAKE_ID}/eligible-replacements` },
  { method: 'POST', permission: 'UMPIRE_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots/${FAKE_ID}/replace`, body: {} },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-history` },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/recommended-umpires` },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/umpire-operations-summary` },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/incidents` },
  { method: 'PATCH', permission: 'MATCH_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-fee`, body: {} },
  { method: 'PATCH', permission: 'MATCH_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots/${FAKE_ID}/payment-status`, body: {} },
  { method: 'POST', permission: 'UMPIRE_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/umpire-slots/${FAKE_ID}/propose`, body: {} },
  { method: 'GET', permission: 'MATCH_VIEW', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/proposals` },
  { method: 'POST', permission: 'UMPIRE_MANAGE', path: (g) => `/ground-owner/grounds/${g}/matches/${FAKE_ID}/proposals/${FAKE_ID}/cancel`, body: {} },
  { method: 'GET', permission: 'STAFF_VIEW', path: (g) => `/ground-owner/grounds/${g}/staff` },
]

test('permission enforcement matrix: every permission-gated route denies staff without the permission and admits staff with it', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('matrix-owner', { role: 'user' })
  const superAdmin = await createUser('matrix-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)
    const staffToken = signToken({ id: staffBody.user.id })

    for (const route of ROUTES) {
      const path = route.path(ground.publicGroundId)
      const opts = { method: route.method, headers: auth(staffToken) }
      if (route.body) opts.body = JSON.stringify(route.body)

      // Several routes intentionally share a permission key — guarantee a
      // clean "definitely doesn't have it" baseline before each route's own
      // check, regardless of what an earlier iteration already granted.
      await revokeIfPresent(server, owner, ground, staffBody.membership.id, route.permission)

      const beforeRes = await fetch(`${server.baseUrl}${path}`, opts)
      assert.equal(beforeRes.status, 403, `${route.method} ${path} must deny staff without ${route.permission} (got ${beforeRes.status})`)

      await grant(server, owner, ground, staffBody.membership.id, route.permission)

      const afterRes = await fetch(`${server.baseUrl}${path}`, opts)
      assert.notEqual(afterRes.status, 403, `${route.method} ${path} must admit staff WITH ${route.permission} (got ${afterRes.status})`)
    }
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission enforcement: Owner passes every route with zero explicit grants, Super Admin bypasses entirely', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('bypass-owner', { role: 'user' })
  const superAdmin = await createUser('bypass-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    if (!owner.cookie) await elevate(owner)

    for (const route of ROUTES) {
      const path = route.path(ground.publicGroundId)
      for (const actor of [owner, superAdmin]) {
        const opts = { method: route.method, headers: cauth(actor) }
        if (route.body) opts.body = JSON.stringify(route.body)
        const res = await fetch(`${server.baseUrl}${path}`, opts)
        assert.notEqual(res.status, 403, `${route.method} ${path} must not deny the ground's own Owner or a Super Admin (got ${res.status})`)
      }
    }
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission enforcement: cross-ground isolation — a staff member with FULL grants on their OWN ground is still denied on a different ground', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const ownerA = await createUser('cross-owner-a', { role: 'user' })
  const ownerB = await createUser('cross-owner-b', { role: 'user' })
  const superAdmin = await createUser('cross-admin', { role: 'staff', staffRoleId: 1 })
  let groundA
  let groundB
  try {
    groundA = await createOwnedGround(ownerA, superAdmin, server, tag)
    groundB = await createOwnedGround(ownerB, superAdmin, server, `${tag}-b`)
    const staffA = await createGroundStaff(server, ownerA, groundA)
    const staffToken = signToken({ id: staffA.user.id })

    for (const permission of ['MATCH_VIEW', 'MATCH_MANAGE', 'UMPIRE_MANAGE', 'STAFF_VIEW']) {
      await grant(server, ownerA, groundA, staffA.membership.id, permission)
    }

    for (const route of ROUTES) {
      const ownGroundRes = await fetch(`${server.baseUrl}${route.path(groundA.publicGroundId)}`, {
        method: route.method,
        headers: auth(staffToken),
        ...(route.body ? { body: JSON.stringify(route.body) } : {}),
      })
      assert.notEqual(ownGroundRes.status, 403, `fully-permissioned staff must be admitted on their OWN ground (${route.method} ${route.path(groundA.publicGroundId)}, got ${ownGroundRes.status})`)

      const otherGroundRes = await fetch(`${server.baseUrl}${route.path(groundB.publicGroundId)}`, {
        method: route.method,
        headers: auth(staffToken),
        ...(route.body ? { body: JSON.stringify(route.body) } : {}),
      })
      assert.equal(otherGroundRes.status, 403, `staff must be denied on a DIFFERENT ground regardless of grants on their own (${route.method} ${route.path(groundB.publicGroundId)}, got ${otherGroundRes.status})`)
    }
  } finally {
    await cleanupGround(groundA)
    await cleanupGround(groundB)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission enforcement: revoke takes effect on the very next request, no re-login', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('revoke-live-owner', { role: 'user' })
  const superAdmin = await createUser('revoke-live-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)
    const staffToken = signToken({ id: staffBody.user.id })

    await grant(server, owner, ground, staffBody.membership.id, 'MATCH_VIEW')
    const beforeRevoke = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/matches`, { headers: auth(staffToken) })
    assert.notEqual(beforeRevoke.status, 403)

    await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/permissions/MATCH_VIEW`, {
      method: 'DELETE',
      headers: cauth(owner),
    })

    const afterRevoke = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/matches`, { headers: auth(staffToken) })
    assert.equal(afterRevoke.status, 403, 'the same session token loses access immediately after revoke — nothing about permissions is cached')
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})
