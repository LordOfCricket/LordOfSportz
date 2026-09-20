// Phase 4 — Ground Owner creates ground-scoped Staff (GROUND_ADMIN/
// CANTEEN_STAFF). Real HTTP against this app's own server, real Postgres —
// same pattern as every other integration test in this codebase.
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
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', staffRoleId = null } = {}) {
  const tag = uniqueTag()
  const user = (
    await pool.query(`INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`, [
      `Integration Test ${label}`,
      `staff-integration-${label}-${tag}@example.test`,
      role,
      staffRoleId,
    ])
  ).rows[0]
  return {
    id: user.id,
    email: user.email,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('UPDATE account_audit_log SET actor_user_id = NULL WHERE actor_user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// Phase 6 — requireGroundRole('GROUND_OWNER') (createGroundStaff,
// listGroundStaff) and requireStaffRole('super_admin') (the approve call
// inside createOwnedGround) now both require req.mfaVerified, which a bare
// JWT can never satisfy (no backing `sessions` row). `elevate` mints a REAL,
// already-MFA-verified session cookie for a user already created via
// createUser above and attaches it as `.cookie`/`.sessionId` — see
// helpers/mfaFixtures.js for why this skips the TOTP ceremony (this file
// isn't testing MFA, only ground-scoped staff creation).
async function elevate(user) {
  const { cookie, sessionId } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  user.sessionId = sessionId
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

// Creates and approves a ground_owner_requests row directly against the
// existing, already-verified approval flow (groundRegistration.integration.
// test.js), so these tests can focus purely on the staff endpoints without
// re-proving the approval transaction.
async function createOwnedGround(owner, superAdmin, server, tag) {
  const submitRes = await fetch(`${server.baseUrl}/grounds`, {
    method: 'POST',
    headers: auth(owner.token),
    body: JSON.stringify({
      name: `Staff Test Ground ${tag}`,
      description: 'A test ground for ground-staff fixtures.',
      addressLine: '1 Rd',
      city: 'City',
      state: 'State',
      phone: '9999999999',
      agreedToTerms: true,
      featuredPhotos: Array.from({ length: 6 }, (_, i) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/staff-${tag}-${i}.jpg`, publicId: `staff-${tag}-${i}` })),
    }),
  })
  const publicRequestId = (await submitRes.json()).request.publicRequestId
  if (!superAdmin.cookie) await elevate(superAdmin)
  // Ground Approval MFA removal (2026-08-24) — approve no longer requires a
  // step-up grant, so this helper no longer mints one (also avoids
  // idx_step_up_grants_active collisions when called more than once per
  // superAdmin session in one test).
  const approveRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cauth(superAdmin) })
  const approveBody = await approveRes.json()
  return approveBody.ground
}

async function cleanupGround(ground) {
  if (!ground) return
  const row = (await pool.query('SELECT id FROM grounds WHERE public_ground_id = $1', [ground.publicGroundId])).rows[0]
  if (!row) return
  const requestRow = (await pool.query('SELECT id FROM ground_owner_requests WHERE created_ground_id = $1', [row.id])).rows[0]
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
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [identifier])
  for (const row of rows) {
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [row.id])
    await pool.query('UPDATE account_audit_log SET target_user_id = NULL WHERE target_user_id = $1', [row.id])
    await pool.query('DELETE FROM users WHERE id = $1', [row.id])
  }
}

test('ground-owner staff: rejects an unauthenticated request', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/GRD-DOESNOTEXIST/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', identifier: 'x@example.test', role: 'GROUND_ADMIN' }),
    })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('ground-owner staff: rejects an invalid role', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('invalid-role-owner', { role: 'user' })
  const superAdmin = await createUser('invalid-role-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    await elevate(owner)
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'X', identifier: `invalid-role-${tag}@example.test`, role: 'GROUND_OWNER' }),
    })
    assert.equal(res.status, 400)
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('ground-owner staff: owner creates a brand-new staff account, reuses an existing user without changing their role, and blocks a different owner', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('flow-owner', { role: 'user' })
  const otherOwner = await createUser('other-owner', { role: 'user' })
  const superAdmin = await createUser('flow-admin', { role: 'staff', staffRoleId: 1 })
  const existingPlayer = await createUser('existing-player', { role: 'player' })
  let ground
  let newStaffIdentifier
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const otherGround = await createOwnedGround(otherOwner, superAdmin, server, `${tag}-other`)
    await elevate(owner)
    await elevate(otherOwner)

    newStaffIdentifier = `new-staff-${tag}@example.test`
    const createRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'New Ground Admin', identifier: newStaffIdentifier, role: 'GROUND_ADMIN' }),
    })
    const createBody = await createRes.json()
    assert.equal(createRes.status, 201)
    assert.equal(createBody.user.role, 'staff')
    assert.equal(createBody.membership.role, 'GROUND_ADMIN')

    const auditRow = (
      await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'STAFF_CREATED' AND target_user_id = $1`, [createBody.user.id])
    ).rows[0]
    assert.ok(auditRow, 'STAFF_CREATED audit event must be recorded')

    // Existing-user reuse: an already-real player's role must not change.
    const reuseRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: existingPlayer.email, identifier: existingPlayer.email, role: 'CANTEEN_STAFF' }),
    })
    const reuseBody = await reuseRes.json()
    assert.equal(reuseRes.status, 201)
    assert.equal(reuseBody.user.id, existingPlayer.id)
    assert.equal(reuseBody.user.role, 'player', "an existing player's role must never be overwritten to staff")

    // Duplicate protection: the same identifier + same role at the same
    // ground a second time is rejected, not silently duplicated.
    const dupRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'New Ground Admin', identifier: newStaffIdentifier, role: 'GROUND_ADMIN' }),
    })
    assert.equal(dupRes.status, 409, 'creating the same person with the same role at the same ground twice must be rejected')

    // Cross-owner rejection: otherOwner cannot create staff for `ground`
    // (owned by `owner`), and `owner` cannot create staff for `otherGround`.
    const crossRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(otherOwner),
      body: JSON.stringify({ name: 'Should Fail', identifier: `cross-${tag}@example.test`, role: 'GROUND_ADMIN' }),
    })
    assert.equal(crossRes.status, 403)
    const crossRes2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${otherGround.publicGroundId}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'Should Fail', identifier: `cross2-${tag}@example.test`, role: 'GROUND_ADMIN' }),
    })
    assert.equal(crossRes2.status, 403)

    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, { headers: cauth(owner) })
    const listBody = await listRes.json()
    assert.equal(listBody.staff.length, 2, 'exactly the two successfully created staff members are listed')

    await cleanupGround(otherGround)
  } finally {
    await cleanupIdentifier(newStaffIdentifier)
    await cleanupGround(ground)
    await owner.cleanup()
    await otherOwner.cleanup()
    await superAdmin.cleanup()
    await existingPlayer.cleanup()
    await server.close()
  }
})

test('ground-owner staff: a plain player (no ownership) cannot create or list staff for any ground', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('self-reg-owner', { role: 'user' })
  const stranger = await createUser('self-reg-stranger', { role: 'player' })
  const superAdmin = await createUser('self-reg-admin', { role: 'staff', staffRoleId: 1 })
  let ground
  try {
    ground = await createOwnedGround(owner, superAdmin, server, tag)
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, {
      method: 'POST',
      headers: auth(stranger.token),
      body: JSON.stringify({ name: 'Should Fail', identifier: `self-reg-${tag}@example.test`, role: 'GROUND_ADMIN' }),
    })
    assert.equal(res.status, 403, 'a non-owner cannot self-register as staff for a ground they do not own')

    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.publicGroundId}/staff`, { headers: auth(stranger.token) })
    assert.equal(listRes.status, 403)
  } finally {
    await cleanupGround(ground)
    await owner.cleanup()
    await stranger.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})
