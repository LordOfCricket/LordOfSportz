// Phase 4 — Ground Owner location & address management.
// Tests authorization, IDOR protection, validation, and data integrity.
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
      [`Integration Test ${label}`, `location-owner-${label}-${tag}@example.test`, role],
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

test('PATCH /ground-owner/grounds/:publicGroundId - owner can update location', async (t) => {
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
        addressLine: '123 Cricket Road',
        city: 'Bhilai',
        state: 'Chhattisgarh',
        postalCode: '490001',
        latitude: 21.2094,
        longitude: 81.4285,
      }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.addressLine, '123 Cricket Road')
    assert.strictEqual(data.ground.city, 'Bhilai')
    assert.strictEqual(data.ground.latitude, 21.2094)
    assert.strictEqual(data.ground.longitude, 81.4285)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - non-owner cannot update location', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('NonOwner', { role: 'player' })
    await elevate(owner)
    await elevate(nonOwner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(nonOwner),
      body: JSON.stringify({ city: 'Hacked' }),
    })
    assert.strictEqual(res.status, 403)

    // Verify ground unchanged
    const checkRes = await pool.query('SELECT city FROM grounds WHERE id = $1', [ground.id])
    assert.notStrictEqual(checkRes.rows[0].city, 'Hacked')

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - invalid latitude rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ latitude: 95 }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - invalid longitude rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ longitude: 200 }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - invalid postal code rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ postalCode: 'invalid' }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - address line length validation', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const tooLongAddress = 'A'.repeat(300)
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ addressLine: tooLongAddress }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - ground isolation (A cannot affect B)', async (t) => {
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

    // Owner1 updates Ground1
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground1.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner1),
      body: JSON.stringify({ city: 'Bhilai' }),
    })
    assert.strictEqual(res.status, 200)

    // Verify Ground2 unchanged
    const check = await pool.query('SELECT city FROM grounds WHERE id = $1', [ground2.id])
    assert.notStrictEqual(check.rows[0].city, 'Bhilai')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - whitespace trimming on address fields', async (t) => {
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
        addressLine: '  123 Cricket Road  ',
        city: '  Delhi  ',
      }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.addressLine, '123 Cricket Road')
    assert.strictEqual(data.ground.city, 'Delhi')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - existing profile fields still work', async (t) => {
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
        name: 'Updated Name',
        phone: '9999999999',
        city: 'Delhi',
      }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.name, 'Updated Name')
    assert.strictEqual(data.ground.phone, '9999999999')
    assert.strictEqual(data.ground.city, 'Delhi')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId - null/undefined values handled correctly', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Set initial values
    await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ city: 'Delhi', latitude: 28.6139 }),
    })

    // Clear values with null
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ city: null, latitude: null }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.city, null)
    assert.strictEqual(data.ground.latitude, null)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})
