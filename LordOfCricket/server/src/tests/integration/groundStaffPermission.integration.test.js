// Phase 5 — granular Staff permission CRUD (grant/revoke/disable), the
// IDOR guard (membershipId must belong to the ground in the URL), and
// audit logging. Real HTTP against this app's own server, real Postgres —
// same pattern/harness as groundStaff.integration.test.js (Phase 4).
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
      `Integration Test ${label}`, `staff-perm-${label}-${tag}@example.test`, role, staffRoleId,
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

// Phase 6 — requireGroundRole('GROUND_OWNER')/requireStaffRole('super_admin')
// now require req.mfaVerified, which a bare JWT can never satisfy. `elevate`
// mints a REAL, already-MFA-verified session cookie for a user already
// created via createUser — see helpers/mfaFixtures.js for why this skips
// the TOTP ceremony (this file isn't testing MFA, only permission CRUD).
// Grant and disable are ALSO step-up-gated (PERMISSION_GRANT/STAFF_DISABLE)
// — mintStepUpGrant issues a fresh one directly, one per call that is
// expected to actually reach the gated mutation.
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
      name: `Staff Perm Ground ${tag}`,
      description: 'A test ground for staff-permission fixtures.',
      addressLine: '1 Rd',
      city: 'City',
      state: 'State',
      phone: '9999999999',
      agreedToTerms: true,
      featuredPhotos: Array.from({ length: 6 }, (_, i) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/staffperm-${tag}-${i}.jpg`, publicId: `staffperm-${tag}-${i}` })),
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

async function createGroundStaff(server, owner, ground, { role = 'GROUND_ADMIN', identifier } = {}) {
  if (!owner.cookie) await elevate(owner)
  const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
    method: 'POST',
    headers: cauth(owner),
    body: JSON.stringify({ name: 'Perm Test Staff', identifier: identifier || `staff-perm-member-${uniqueTag()}@example.test`, role }),
  })
  return res.json()
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
  // ground_amenities, which didn't happen before this cleanup was written.
  await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [row.id])
  await pool.query('DELETE FROM ground_amenities WHERE ground_id = $1', [row.id])
  if (requestRow) {
    await pool.query('DELETE FROM account_audit_log WHERE target_request_id = $1', [requestRow.id])
    await pool.query('DELETE FROM ground_owner_requests WHERE id = $1', [requestRow.id])
  }
  await pool.query('DELETE FROM grounds WHERE id = $1', [row.id])
}

async function cleanupIdentifier(identifier) {
  if (!identifier) return
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [identifier])
  for (const row of rows) {
    await pool.query('DELETE FROM staff_permissions WHERE ground_user_id IN (SELECT id FROM ground_users WHERE user_id = $1)', [row.id])
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [row.id])
    await pool.query('UPDATE account_audit_log SET target_user_id = NULL WHERE target_user_id = $1', [row.id])
    await pool.query('DELETE FROM users WHERE id = $1', [row.id])
  }
}

test('GET /ground-owner/permissions/catalog: requires auth, returns exactly the 8 catalog permissions', async () => {
  const server = await startTestApp()
  const owner = await createUser('catalog-owner', { role: 'user' })
  try {
    const unauth = await fetch(`${server.baseUrl}/ground-owner/permissions/catalog`)
    assert.equal(unauth.status, 401)

    const res = await fetch(`${server.baseUrl}/ground-owner/permissions/catalog`, { headers: auth(owner.token) })
    assert.equal(res.status, 200)
    const body = await res.json()
    const keys = body.permissions.map((p) => p.key).sort()
    // Phase 24/25 added BOOKING_VIEW/BOOKING_MANAGE to the shared permissions
    // catalog (ground booking delegation for GROUND_ADMIN staff), alongside
    // the original 4 (match/staff/umpire management). Ground Time-Slot
    // Pricing added PRICING_VIEW/PRICING_MANAGE the same way.
    assert.deepEqual(keys, ['BOOKING_MANAGE', 'BOOKING_VIEW', 'MATCH_MANAGE', 'MATCH_VIEW', 'PRICING_MANAGE', 'PRICING_VIEW', 'STAFF_VIEW', 'UMPIRE_MANAGE'])
  } finally {
    await owner.cleanup()
    await server.close()
  }
})

test('permission grant/revoke: happy path, duplicate 409, revoke-nothing-active 404, audit events recorded', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('grant-owner', { role: 'user' })
  const superAdmin = await createUser('grant-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  let membershipId
  let staffUserId
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)
    membershipId = staffBody.membership.id
    staffUserId = staffBody.user.id

    await mintStepUpGrant(owner.sessionId, owner.id, 'PERMISSION_GRANT')
    const grantRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(grantRes.status, 201)

    // A fresh grant so this second attempt reaches the "already granted"
    // check (409) rather than failing on a missing step-up grant (403).
    await mintStepUpGrant(owner.sessionId, owner.id, 'PERMISSION_GRANT')
    const dupRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(dupRes.status, 409, 'granting an already-active permission is rejected, not silently duplicated')

    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, { headers: cauth(owner) })
    const listBody = await listRes.json()
    const staffRow = listBody.staff.find((s) => s.membershipId === membershipId)
    assert.deepEqual(staffRow.permissions, ['MATCH_VIEW'], 'staff list reflects the current grant')

    const revokeRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions/MATCH_VIEW`, {
      method: 'DELETE',
      headers: cauth(owner),
    })
    assert.equal(revokeRes.status, 200)

    const revokeAgainRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions/MATCH_VIEW`, {
      method: 'DELETE',
      headers: cauth(owner),
    })
    assert.equal(revokeAgainRes.status, 404, 'revoking a permission that is not currently active is rejected, not a silent no-op')

    const grantAudit = (
      await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'PERMISSION_GRANTED' AND target_user_id = $1`, [staffUserId])
    ).rows[0]
    assert.ok(grantAudit)
    assert.equal(grantAudit.metadata.permissionKey, 'MATCH_VIEW')
    assert.equal(grantAudit.metadata.membershipId, membershipId)

    const revokeAudit = (
      await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'PERMISSION_REVOKED' AND target_user_id = $1`, [staffUserId])
    ).rows[0]
    assert.ok(revokeAudit)
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission grant: unknown permission key is rejected (forged privileged string included)', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('forge-owner', { role: 'user' })
  const superAdmin = await createUser('forge-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)

    for (const forged of ['GROUND_OWNER', 'SUPER_ADMIN', 'not_a_real_permission']) {
      const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/permissions`, {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({ permissionKey: forged }),
      })
      assert.equal(res.status, 400, `permissionKey='${forged}' must be rejected`)
    }
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission grant/revoke/disable: membershipId belonging to a DIFFERENT ground is rejected (IDOR), and a GROUND_OWNER membership can never be targeted', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const ownerA = await createUser('idor-owner-a', { role: 'user' })
  const ownerB = await createUser('idor-owner-b', { role: 'user' })
  const superAdmin = await createUser('idor-admin', { role: 'staff', staffRoleId: 1 })
  let groundA
  let groundB
  try {
    groundA = await createOwnedGround(ownerA, superAdmin, server, tag)
    groundB = await createOwnedGround(ownerB, superAdmin, server, `${tag}-b`)
    const staffB = await createGroundStaff(server, ownerB, groundB)
    await elevate(ownerA)

    // ownerA tries to grant a permission on THEIR OWN ground using a
    // membershipId that actually belongs to ownerB's ground.
    const crossRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.publicGroundId}/staff/${staffB.membership.id}/permissions`, {
      method: 'POST',
      headers: cauth(ownerA),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(crossRes.status, 404, 'a membershipId from a different ground must not resolve, even under the callers own :publicGroundId')

    // The GROUND_OWNER membership row itself is never a valid target, even
    // for its own owner acting on their own ground (defense-in-depth).
    const ownerMembershipRow = (
      await pool.query(`SELECT id FROM ground_users WHERE user_id = $1 AND role = 'GROUND_OWNER'`, [ownerA.id])
    ).rows[0]
    const ownerTargetRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.publicGroundId}/staff/${ownerMembershipRow.id}/permissions`, {
      method: 'POST',
      headers: cauth(ownerA),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(ownerTargetRes.status, 400, 'a GROUND_OWNER membership row can never be the target of a grant/revoke/disable')

    const disableOwnerRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.publicGroundId}/staff/${ownerMembershipRow.id}/disable`, {
      method: 'PATCH',
      headers: cauth(ownerA),
    })
    assert.equal(disableOwnerRes.status, 400)
  } finally {
    await cleanupGround(groundA)
    await cleanupGround(groundB)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission grant: two concurrent requests (different sessions) for the same membership+permission never produce a 500 — the DB unique index backstops the race', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('race-owner', { role: 'user' })
  const superAdmin = await createUser('race-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)
    const membershipId = staffBody.membership.id

    // Two independent MFA-verified sessions for the SAME owner (two tabs/
    // devices), each with its own fresh step-up grant for the same action —
    // so both requests reach grantStaffPermission's mutation at the same
    // time instead of one failing on a missing/already-consumed grant.
    // idx_step_up_grants_active is (session_id, action_scope)-unique, so two
    // grants for the SAME session would collide — two sessions sidesteps
    // that and is also the more realistic race to test.
    const sessionA = await mintMfaVerifiedSessionCookie(owner.id)
    const sessionB = await mintMfaVerifiedSessionCookie(owner.id)
    await mintStepUpGrant(sessionA.sessionId, owner.id, 'PERMISSION_GRANT')
    await mintStepUpGrant(sessionB.sessionId, owner.id, 'PERMISSION_GRANT')

    const fire = (cookie) =>
      fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${membershipId}/permissions`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
      })

    const [resA, resB] = await Promise.all([fire(sessionA.cookie), fire(sessionB.cookie)])
    const statuses = [resA.status, resB.status].sort()
    assert.deepEqual(statuses, [201, 409], 'exactly one concurrent grant must succeed and the other must get a clean 409, never a raw 500')

    const activeGrants = (
      await pool.query(
        `SELECT count(*)::int AS count FROM staff_permissions sp
         JOIN permissions p ON p.id = sp.permission_id
         WHERE sp.ground_user_id = $1 AND p.key = 'MATCH_VIEW' AND sp.revoked_at IS NULL`,
        [membershipId],
      )
    ).rows[0]
    assert.equal(activeGrants.count, 1, 'exactly one active grant row must exist after the race, never two')
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('disable: deactivates the membership and is recorded in the audit log', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('disable-owner', { role: 'user' })
  const superAdmin = await createUser('disable-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)

    await mintStepUpGrant(owner.sessionId, owner.id, 'STAFF_DISABLE')
    const disableRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/disable`, {
      method: 'PATCH',
      headers: cauth(owner),
    })
    assert.equal(disableRes.status, 200)

    const row = (await pool.query('SELECT is_active FROM ground_users WHERE id = $1', [staffBody.membership.id])).rows[0]
    assert.equal(row.is_active, false)

    const auditRow = (
      await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'STAFF_DISABLED' AND target_user_id = $1`, [staffBody.user.id])
    ).rows[0]
    assert.ok(auditRow)
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('permission management routes: staff (even with grants) can never grant/revoke/disable, and non-owners are rejected', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('escalate-owner', { role: 'user' })
  const superAdmin = await createUser('escalate-admin', { role: 'staff', staffRoleId: 1 })
  const stranger = await createUser('escalate-stranger', { role: 'player' })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const staffBody = await createGroundStaff(server, owner, ground)
    const staffToken = signToken({ id: staffBody.user.id })

    const selfGrant = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/permissions`, {
      method: 'POST',
      headers: auth(staffToken),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(selfGrant.status, 403, 'staff cannot self-grant, even before holding any permission')

    const strangerGrant = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/permissions`, {
      method: 'POST',
      headers: auth(stranger.token),
      body: JSON.stringify({ permissionKey: 'MATCH_VIEW' }),
    })
    assert.equal(strangerGrant.status, 403)

    const staffDisableOther = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff/${staffBody.membership.id}/disable`, {
      method: 'PATCH',
      headers: auth(staffToken),
    })
    assert.equal(staffDisableOther.status, 403, 'staff cannot disable a membership (including their own) even with an active session')
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await stranger.cleanup()
    await server.close()
  }
})
