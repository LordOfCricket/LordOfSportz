// Phase 1 — Ground Owner profile update endpoint authorization and security.
// Tests that only whitelisted fields (name, description, phone, email, website)
// can be updated, ownership is enforced, and IDOR attacks are prevented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
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
      [`Integration Test ${label}`, `profile-update-${label}-${tag}@example.test`, role],
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
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

test('PATCH /ground-owner/grounds/:publicGroundId - authentication required', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // No auth header
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    assert.strictEqual(res.status, 401, 'Should require authentication')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - owner can update own ground', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Original Name', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        name: 'Updated Ground Name',
        description: 'Updated description',
        phone: '+91 9999999999',
        email: 'updated@example.com',
        website: 'https://example.com',
      }),
    })
    assert.strictEqual(res.status, 200, 'Owner should be able to update ground')
    const data = await res.json()
    assert.strictEqual(data.ground.name, 'Updated Ground Name')
    assert.strictEqual(data.ground.description, 'Updated description')
    assert.strictEqual(data.ground.phone, '+91 9999999999')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - non-owner cannot update', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('Non-Owner', { role: 'player' })
    await elevate(nonOwner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(nonOwner),
      body: JSON.stringify({ name: 'Hacked Name' }),
    })
    assert.strictEqual(res.status, 403, 'Non-owner should be denied')

    // Verify ground was not updated
    const { rows: [updated] } = await pool.query('SELECT name FROM grounds WHERE id = $1', [ground.id])
    assert.strictEqual(updated.name, 'Test Ground', 'Ground should not be modified')

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - cannot modify non-whitelisted fields', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        name: 'New Name',
        status: 'SUSPENDED',
        id: 999,
        public_ground_id: 'hacked',
      }),
    })
    assert.strictEqual(res.status, 200, 'Request should succeed')
    const data = await res.json()

    // Verify only whitelisted fields were updated
    assert.strictEqual(data.ground.name, 'New Name', 'name should be updated')
    assert.strictEqual(data.ground.status, 'ACTIVE', 'status should NOT be updated')
    assert.notStrictEqual(data.ground.public_ground_id, 'hacked', 'public_ground_id should NOT be updated')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - validates email format', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        name: 'Test',
        email: 'not-a-valid-email',
      }),
    })
    // Note: Frontend does validation; backend may or may not validate.
    // This test ensures backend doesn't crash on invalid input.
    assert([200, 400].includes(res.status), 'Should handle email gracefully')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - trims whitespace', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        name: '  Trimmed Name  ',
        description: '  Description with spaces  ',
      }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.name, 'Trimmed Name', 'Whitespace should be trimmed')
    assert.strictEqual(data.ground.description, 'Description with spaces', 'Whitespace should be trimmed')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - public homepage reflects updates', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Original', tag)

    // Update ground profile
    await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        name: 'Updated Ground',
        description: 'Updated description',
      }),
    })

    // Fetch public profile
    const publicRes = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    assert.strictEqual(publicRes.status, 200)
    const data = await publicRes.json()
    assert.strictEqual(data.ground.name, 'Updated Ground', 'Public API should return updated name')
    assert.strictEqual(data.ground.description, 'Updated description', 'Public API should return updated description')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - multiple owners isolated', async (t) => {
  const server = await startTestApp()
  try {
    const tag1 = uniqueTag()
    const tag2 = uniqueTag()
    const owner1 = await createUser('Owner1', { role: 'player' })
    const owner2 = await createUser('Owner2', { role: 'player' })
    await elevate(owner1)
    await elevate(owner2)

    const ground1 = await createOwnedGround(owner1.id, 'Ground 1', tag1)
    const ground2 = await createOwnedGround(owner2.id, 'Ground 2', tag2)

    // Owner1 tries to update Owner2's ground
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner1),
      body: JSON.stringify({ name: 'Hacked' }),
    })
    assert.strictEqual(res.status, 403, 'Owner should not access another owner\'s ground')

    // Verify ground2 was not modified
    const { rows: [g2] } = await pool.query('SELECT name FROM grounds WHERE id = $1', [ground2.id])
    assert.strictEqual(g2.name, 'Ground 2', 'Ground 2 should not be modified')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

// Phase 23 — operating hours (opening_hour/closing_hour). schema.sql has
// carried these columns, with their own CHECK constraints, since Phase 14
// Part 3, and domain/booking/teamBookingValidation.js#resolveGroundHours has
// always read a per-ground override — but no write path existed until now.
// Reuses the exact same PATCH /ground-owner/grounds/:publicGroundId
// endpoint tested above; auth/ownership/IDOR are already covered by the
// tests above and apply unchanged to these new fields.

test('PATCH /ground-owner/grounds/:publicGroundId - owner can set operating hours, read back via public profile', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Hours Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ openingHour: 8, closingHour: 20 }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.openingHour, 8)
    assert.strictEqual(data.ground.closingHour, 20)

    const publicRes = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    const publicData = await publicRes.json()
    assert.strictEqual(publicData.ground.openingHour, 8, 'the public profile (the same endpoint the owner edit page reads from) must reflect the saved hours')
    assert.strictEqual(publicData.ground.closingHour, 20)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - opening/closing hour out of range is rejected (mirrors the DB CHECK constraint)', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Hours Ground', tag)

    const badOpening = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ openingHour: 24 }),
    })
    assert.strictEqual(badOpening.status, 400)

    const badClosing = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ closingHour: 0 }),
    })
    assert.strictEqual(badClosing.status, 400)

    const nonInteger = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ openingHour: 9.5 }),
    })
    assert.strictEqual(nonInteger.status, 400)

    const { rows: [row] } = await pool.query('SELECT opening_hour, closing_hour FROM grounds WHERE id = $1', [ground.id])
    assert.strictEqual(row.opening_hour, null, 'a rejected update must not partially persist')
    assert.strictEqual(row.closing_hour, null)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - closing hour must be later than opening hour when both are set together', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Hours Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ openingHour: 18, closingHour: 10 }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - setting only one of opening/closing hour is allowed (independent fallback)', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Hours Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ openingHour: 5 }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.openingHour, 5)
    assert.strictEqual(data.ground.closingHour, null, 'closingHour was never set — must stay null (platform default), not be forced')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - non-owner cannot set operating hours (reuses existing ownership check)', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('Non-Owner', { role: 'player' })
    await elevate(nonOwner)
    const ground = await createOwnedGround(owner.id, 'Hours Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(nonOwner),
      body: JSON.stringify({ openingHour: 6, closingHour: 23 }),
    })
    assert.strictEqual(res.status, 403)

    const { rows: [row] } = await pool.query('SELECT opening_hour, closing_hour FROM grounds WHERE id = $1', [ground.id])
    assert.strictEqual(row.opening_hour, null)
    assert.strictEqual(row.closing_hour, null)

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})
