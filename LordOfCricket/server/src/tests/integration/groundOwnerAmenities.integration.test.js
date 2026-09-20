// Phase 3 — Ground Owner amenity management (select from catalog, remove).
// Tests authorization, IDOR protection, duplicate prevention, and data integrity.
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
      [`Integration Test ${label}`, `amenities-owner-${label}-${tag}@example.test`, role],
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
  await pool.query('DELETE FROM ground_amenities WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

test('GET /ground-owner/grounds/:publicGroundId/amenities - lists current amenities', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test amenity selection
    await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2)`,
      [ground.id, 'floodlights'],
    )

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/amenities`, {
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.amenities))
    assert.strictEqual(data.amenities.length, 1)
    assert.strictEqual(data.amenities[0].key, 'floodlights')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/amenities - requires authentication', async (t) => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/test-ground/amenities`, {
      headers: { 'Content-Type': 'application/json' },
    })
    assert.strictEqual(res.status, 401)
  } finally {
    await server.close()
  }
})

test('POST /ground-owner/grounds/:publicGroundId/amenities - owner can add amenity', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/amenities`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ amenityKey: 'parking' }),
    })
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.ok(Array.isArray(data.amenities))
    const added = data.amenities.find(a => a.key === 'parking')
    assert.ok(added, 'parking amenity should be in response')

    // Verify in database
    const checkRes = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground.id, 'parking'])
    assert.strictEqual(checkRes.rows.length, 1)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('POST /ground-owner/grounds/:publicGroundId/amenities - duplicate amenity returns 409', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Pre-add the amenity
    await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2)`,
      [ground.id, 'floodlights'],
    )

    // Try to add it again
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/amenities`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ amenityKey: 'floodlights' }),
    })
    assert.strictEqual(res.status, 409)

    // Verify only one row exists
    const checkRes = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground.id, 'floodlights'])
    assert.strictEqual(checkRes.rows.length, 1)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('DELETE /ground-owner/grounds/:publicGroundId/amenities/:amenityKey - owner can remove amenity', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test amenity
    await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2)`,
      [ground.id, 'parking'],
    )

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/amenities/parking`, {
      method: 'DELETE',
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200)

    // Verify deletion
    const checkRes = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground.id, 'parking'])
    assert.strictEqual(checkRes.rows.length, 0)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('DELETE /ground-owner/grounds/:publicGroundId/amenities/:amenityKey - cannot delete another owner\'s amenity', async (t) => {
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

    // Insert amenity in ground2
    await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2)`,
      [ground2.id, 'canteen'],
    )

    // Owner1 tries to delete from ground2
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}/amenities/canteen`, {
      method: 'DELETE',
      headers: cauth(owner1),
    })
    assert.strictEqual(res.status, 403, 'Should deny cross-owner deletion')

    // Verify amenity still exists in ground2
    const checkRes = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground2.id, 'canteen'])
    assert.strictEqual(checkRes.rows.length, 1, 'Amenity should not be deleted')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('Ground isolation - amenity changes in Ground A do not affect Ground B', async (t) => {
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

    // Both grounds have the same amenity
    await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2), ($3, $4)`,
      [ground1.id, 'floodlights', ground2.id, 'floodlights'],
    )

    // Owner1 removes the amenity from ground1
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground1.public_ground_id}/amenities/floodlights`, {
      method: 'DELETE',
      headers: cauth(owner1),
    })
    assert.strictEqual(res.status, 200)

    // Verify ground1 no longer has it
    const check1 = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground1.id, 'floodlights'])
    assert.strictEqual(check1.rows.length, 0, 'Ground 1 should not have the amenity')

    // Verify ground2 still has it
    const check2 = await pool.query('SELECT * FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2', [ground2.id, 'floodlights'])
    assert.strictEqual(check2.rows.length, 1, 'Ground 2 should still have the amenity')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('Catalog protection - owner cannot add inactive amenity', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/amenities`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ amenityKey: 'nonexistent_inactive' }),
    })
    assert.strictEqual(res.status, 400, 'Should reject nonexistent/inactive amenity')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('Catalog protection - owner cannot modify amenity catalog', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Attempting to PATCH/PUT the catalog itself should fail
    // (This endpoint doesn't exist, confirming owner cannot create custom amenities)
    const res = await fetch(`${server.baseUrl}/amenity-catalog/pitch`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'Custom Pitch' }),
    })
    assert.strictEqual(res.status, 404, 'Catalog modification endpoint should not exist')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})
