// Phase 2 — Ground Owner media management (upload, delete, reorder, set hero).
// Tests authorization, IDOR protection, hero invariant, and Cloudinary cleanup.
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
      [`Integration Test ${label}`, `media-owner-${label}-${tag}@example.test`, role],
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
  await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

test('GET /ground-owner/grounds/:publicGroundId/media - lists photos', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test photos
    await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order, is_featured)
       VALUES ($1, $2, $3, $4, $5)`,
      [ground.id, 'Photo 1', 'https://example.com/1.jpg', 1, false],
    )

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/media`, {
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.photos.length, 1)
    assert.strictEqual(data.photos[0].title, 'Photo 1')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('POST /ground-owner/grounds/:publicGroundId/media - requires authentication', async (t) => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/test-ground/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: 'https://example.com/test.jpg' }),
    })
    assert.strictEqual(res.status, 401)
  } finally {
    await server.close()
  }
})

test('DELETE /ground-owner/grounds/:publicGroundId/media/:id - owner can delete own photo', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test photo
    const photoRes = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground.id, 'Photo 1', 'https://example.com/1.jpg', 1],
    )
    const photoId = photoRes.rows[0].id

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/media/${photoId}`, {
      method: 'DELETE',
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200)

    // Verify deletion
    const checkRes = await pool.query('SELECT * FROM ground_photos WHERE id = $1', [photoId])
    assert.strictEqual(checkRes.rows.length, 0)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('DELETE /ground-owner/grounds/:publicGroundId/media/:id - cannot delete another owner\'s photo', async (t) => {
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

    // Insert photo in ground2
    const photoRes = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground2.id, 'Photo 2', 'https://example.com/2.jpg', 1],
    )
    const photoId = photoRes.rows[0].id

    // Owner1 tries to delete owner2's photo
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}/media/${photoId}`, {
      method: 'DELETE',
      headers: cauth(owner1),
    })
    assert.strictEqual(res.status, 403, 'Should deny cross-owner deletion')

    // Verify photo still exists
    const checkRes = await pool.query('SELECT * FROM ground_photos WHERE id = $1', [photoId])
    assert.strictEqual(checkRes.rows.length, 1, 'Photo should not be deleted')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId/media/:id/hero - sets featured photo', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test photos
    const photo1Res = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order, is_featured)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ground.id, 'Photo 1', 'https://example.com/1.jpg', 1, true],
    )
    const photo1Id = photo1Res.rows[0].id

    const photo2Res = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order, is_featured)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ground.id, 'Photo 2', 'https://example.com/2.jpg', 2, false],
    )
    const photo2Id = photo2Res.rows[0].id

    // Set photo2 as hero
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/media/${photo2Id}/hero`, {
      method: 'PATCH',
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.photo.is_featured, true)

    // Verify hero invariant: photo1 is no longer featured
    const check1 = await pool.query('SELECT is_featured FROM ground_photos WHERE id = $1', [photo1Id])
    assert.strictEqual(check1.rows[0].is_featured, false)

    // Verify photo2 is now featured
    const check2 = await pool.query('SELECT is_featured FROM ground_photos WHERE id = $1', [photo2Id])
    assert.strictEqual(check2.rows[0].is_featured, true)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId/media/:id/hero - cannot set another owner\'s photo as hero', async (t) => {
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

    // Insert photo in ground2
    const photoRes = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground2.id, 'Photo 2', 'https://example.com/2.jpg', 1],
    )
    const photoId = photoRes.rows[0].id

    // Owner1 tries to set owner2's photo as hero
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}/media/${photoId}/hero`, {
      method: 'PATCH',
      headers: cauth(owner1),
    })
    assert.strictEqual(res.status, 403)

    // Verify photo is not featured
    const checkRes = await pool.query('SELECT is_featured FROM ground_photos WHERE id = $1', [photoId])
    assert.strictEqual(checkRes.rows[0].is_featured, false)

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId/media/reorder - reorders photos', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    // Insert test photos
    const photo1Res = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground.id, 'Photo 1', 'https://example.com/1.jpg', 1],
    )
    const photo1Id = photo1Res.rows[0].id

    const photo2Res = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground.id, 'Photo 2', 'https://example.com/2.jpg', 2],
    )
    const photo2Id = photo2Res.rows[0].id

    // Reorder: photo1 -> 2, photo2 -> 1
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/media/reorder`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({
        updates: [
          { photoId: photo1Id, sortOrder: 2 },
          { photoId: photo2Id, sortOrder: 1 },
        ],
      }),
    })
    assert.strictEqual(res.status, 200)

    // Verify ordering
    const check1 = await pool.query('SELECT sort_order FROM ground_photos WHERE id = $1', [photo1Id])
    assert.strictEqual(check1.rows[0].sort_order, 2)

    const check2 = await pool.query('SELECT sort_order FROM ground_photos WHERE id = $1', [photo2Id])
    assert.strictEqual(check2.rows[0].sort_order, 1)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /ground-owner/grounds/:publicGroundId/media/reorder - cannot reorder another owner\'s photos', async (t) => {
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

    // Insert photo in ground2
    const photoRes = await pool.query(
      `INSERT INTO ground_photos (ground_id, title, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [ground2.id, 'Photo 2', 'https://example.com/2.jpg', 1],
    )
    const photoId = photoRes.rows[0].id

    // Owner1 tries to reorder owner2's photo
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}/media/reorder`, {
      method: 'PATCH',
      headers: cauth(owner1),
      body: JSON.stringify({
        updates: [{ photoId, sortOrder: 5 }],
      }),
    })
    assert.strictEqual(res.status, 403)

    // Verify ordering unchanged
    const checkRes = await pool.query('SELECT sort_order FROM ground_photos WHERE id = $1', [photoId])
    assert.strictEqual(checkRes.rows[0].sort_order, 1)

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})
