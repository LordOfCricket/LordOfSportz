// Phase 6 — Ground Owner booking management.
// Tests ground-scoped booking operations with proper authorization and isolation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie, mintStepUpGrant } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = { emit: () => {}, to: () => ({ emit: () => {} }) }
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

const uniqueTag = () => Math.random().toString(36).slice(2, 10)

async function createUser(label, { role = 'player' } = {}) {
  const tag = uniqueTag()
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash',$3) RETURNING *`,
      [`Integration Test ${label}`, `booking-owner-${label}-${tag}@example.test`, role],
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

async function elevate(user) {
  const { cookie, sessionId } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  user.sessionId = sessionId
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

async function createOwnedGround(userId, label, tag) {
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *`,
    [`test-ground-${tag}`, `test-ground-${tag}`, label, 'Test ground'],
  )
  await pool.query(
    `INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1, $2, 'GROUND_OWNER', true)`,
    [userId, ground.id],
  )
  return ground
}

async function cleanupGround(groundId) {
  await pool.query('DELETE FROM ground_bookings WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

// Tests

test('GET /ground-owner/grounds/:publicGroundId/bookings/availability - owner can view availability', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const date = tomorrow.toISOString().split('T')[0]
    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/availability?date=${date}`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert(Array.isArray(data.slots))

    // Phase 11 audit fix — must run before owner.cleanup(): ground_bookings
    // rows this test creates reference the owner via created_by_staff_id,
    // and cleanupGround deletes ground_bookings first. The reverse order
    // was always wrong; it only started raising an FK violation once the
    // staff-block creation itself started succeeding (see hour/blockType
    // fixes above) instead of failing before any row existed to clean up.
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/bookings - owner can list ground bookings', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert(Array.isArray(data.bookings))

    // Phase 11 audit fix — must run before owner.cleanup(): ground_bookings
    // rows this test creates reference the owner via created_by_staff_id,
    // and cleanupGround deletes ground_bookings first. The reverse order
    // was always wrong; it only started raising an FK violation once the
    // staff-block creation itself started succeeding (see hour/blockType
    // fixes above) instead of failing before any row existed to clean up.
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('POST /ground-owner/grounds/:publicGroundId/bookings/staff-blocks - owner can create staff block', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const dayAfterTomorrow = new Date()
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
    const date = dayAfterTomorrow.toISOString().split('T')[0]

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          date,
          hour: 8,
          minute: 0,
          purpose: 'Maintenance',
          blockType: 'PITCH_MAINTENANCE',
        }),
      },
    )
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.strictEqual(data.booking.blockType, 'PITCH_MAINTENANCE')
    assert.strictEqual(data.booking.bookingType, 'STAFF_BLOCK')

    // Phase 11 audit fix — must run before owner.cleanup(): ground_bookings
    // rows this test creates reference the owner via created_by_staff_id,
    // and cleanupGround deletes ground_bookings first. The reverse order
    // was always wrong; it only started raising an FK violation once the
    // staff-block creation itself started succeeding (see hour/blockType
    // fixes above) instead of failing before any row existed to clean up.
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('DELETE /ground-owner/grounds/:publicGroundId/bookings/staff-blocks/:publicBlockId - owner can remove staff block', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const dayAfterTomorrow = new Date()
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
    const date = dayAfterTomorrow.toISOString().split('T')[0]

    const createRes = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          date,
          hour: 8,
          minute: 0,
          purpose: 'Test Block',
          blockType: 'PITCH_MAINTENANCE',
        }),
      },
    )
    const { booking } = await createRes.json()

    const deleteRes = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks/${booking.publicBookingId}`,
      { method: 'DELETE', headers: cauth(owner) },
    )
    assert.strictEqual(deleteRes.status, 200)

    // Phase 11 audit fix — must run before owner.cleanup(): ground_bookings
    // rows this test creates reference the owner via created_by_staff_id,
    // and cleanupGround deletes ground_bookings first. The reverse order
    // was always wrong; it only started raising an FK violation once the
    // staff-block creation itself started succeeding (see hour/blockType
    // fixes above) instead of failing before any row existed to clean up.
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('Authorization - non-owner cannot access owner ground bookings', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('NonOwner', { role: 'player' })
    await elevate(owner)
    await elevate(nonOwner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings`,
      { headers: cauth(nonOwner) },
    )
    assert.strictEqual(res.status, 403)

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('Ground isolation - owner A cannot access owner B ground bookings', async (t) => {
  const server = await startTestApp()
  try {
    const tag1 = uniqueTag()
    const tag2 = uniqueTag()
    const ownerA = await createUser('OwnerA', { role: 'player' })
    const ownerB = await createUser('OwnerB', { role: 'player' })
    await elevate(ownerA)
    await elevate(ownerB)
    const groundA = await createOwnedGround(ownerA.id, 'Ground A', tag1)
    const groundB = await createOwnedGround(ownerB.id, 'Ground B', tag2)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/bookings`,
      { headers: cauth(ownerA) },
    )
    assert.strictEqual(res.status, 403)

    await ownerA.cleanup()
    await ownerB.cleanup()
    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
  } finally {
    await server.close()
  }
})

test('MFA required - unauthenticated request rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings`,
      { headers: { 'Content-Type': 'application/json' } },
    )
    assert.strictEqual(res.status, 401)

    // Phase 11 audit fix — must run before owner.cleanup(): ground_bookings
    // rows this test creates reference the owner via created_by_staff_id,
    // and cleanupGround deletes ground_bookings first. The reverse order
    // was always wrong; it only started raising an FK violation once the
    // staff-block creation itself started succeeding (see hour/blockType
    // fixes above) instead of failing before any row existed to clean up.
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// Ground Owner Staff Audit — BOOKING_VIEW previously did nothing at these two
// GET routes (only BOOKING_MANAGE was accepted), so a staff member granted
// only "View Bookings" in the Owner's Staff Management UI got a 403 despite
// the Owner believing they'd granted read access. Now consistent with
// bookingConflict.service.js#assertCanViewBooking's own established
// VIEW-or-MANAGE rule.
test('GET /ground-owner/grounds/:publicGroundId/bookings - a staff member with only BOOKING_VIEW can list and read, but not mutate', async (t) => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const owner = await createUser('Owner', { role: 'player' })
  let ground
  let staffUser
  try {
    await elevate(owner)
    ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const staffRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/staff`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'View Only Staff', identifier: `booking-view-staff-${tag}@example.test`, role: 'GROUND_ADMIN' }),
    })
    assert.equal(staffRes.status, 201, JSON.stringify(await staffRes.clone().json()))
    const { membership, user } = await staffRes.json()
    staffUser = { id: user.id, token: signToken({ id: user.id }) }

    await mintStepUpGrant(owner.sessionId, owner.id, 'PERMISSION_GRANT')
    const grantRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/staff/${membership.id}/permissions`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ permissionKey: 'BOOKING_VIEW' }),
    })
    assert.equal(grantRes.status, 201)

    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings`, {
      headers: { Authorization: `Bearer ${staffUser.token}` },
    })
    assert.equal(listRes.status, 200, 'BOOKING_VIEW alone must be enough to list bookings')
    const { bookings } = await listRes.json()
    assert.ok(Array.isArray(bookings))

    // Still cannot mutate — BOOKING_VIEW is read-only, unchanged.
    const blockRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffUser.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2027-01-01', hour: 8, minute: 0, purpose: 'Should be rejected' }),
    })
    assert.equal(blockRes.status, 403, 'staff blocks remain GROUND_OWNER-only regardless of BOOKING_VIEW')
  } finally {
    if (ground) await cleanupGround(ground.id)
    if (staffUser) await pool.query('DELETE FROM users WHERE id = $1', [staffUser.id])
    await owner.cleanup()
    await server.close()
  }
})
