// Phase 9 — Ground Owner Operations Dashboard. Provides real-time visibility
// into today's and upcoming ground activities.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

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
      [`Integration Test ${label}`, `dashboard-owner-${label}-${tag}@example.test`, role],
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
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
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

// Phase 9 Tests
test('GET /ground-owner/grounds/:publicGroundId/dashboard - owner can access their own ground dashboard', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert(data.date)
    assert(data.groundStatus)
    assert(data.today)
    assert(Array.isArray(data.today.bookings))
    assert(Array.isArray(data.today.blocks))
    assert(Array.isArray(data.today.matches))

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/dashboard - non-owner cannot access dashboard', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const otherUser = await createUser('OtherUser', { role: 'player' })
    await elevate(otherUser)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`,
      { headers: cauth(otherUser) },
    )
    assert.strictEqual(res.status, 403)

    await owner.cleanup()
    await otherUser.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/dashboard - unauthenticated request rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`,
    )
    assert.strictEqual(res.status, 401)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/dashboard - ground isolation verified', async (t) => {
  const server = await startTestApp()
  try {
    const tag1 = uniqueTag()
    const tag2 = uniqueTag()
    const owner1 = await createUser('Owner1', { role: 'player' })
    await elevate(owner1)
    const ground1 = await createOwnedGround(owner1.id, 'Ground 1', tag1)

    const owner2 = await createUser('Owner2', { role: 'player' })
    await elevate(owner2)
    const ground2 = await createOwnedGround(owner2.id, 'Ground 2', tag2)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground2.public_ground_id}/dashboard`,
      { headers: cauth(owner1) },
    )
    assert.strictEqual(res.status, 403, 'Owner 1 cannot access Owner 2 ground')

    await owner1.cleanup()
    await owner2.cleanup()
    await cleanupGround(ground1.id)
    await cleanupGround(ground2.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/dashboard - dashboard includes today metrics', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert(data.today.hasOwnProperty('bookingsCount'))
    assert(data.today.hasOwnProperty('blocksCount'))
    assert(data.today.hasOwnProperty('matchesCount'))
    assert(data.today.hasOwnProperty('timeline'))
    assert.strictEqual(typeof data.today.bookingsCount, 'number')
    assert.strictEqual(typeof data.today.blocksCount, 'number')
    assert.strictEqual(typeof data.today.matchesCount, 'number')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner/grounds/:publicGroundId/dashboard - includes 7-day upcoming preview', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert(data.upcoming7Days)
    assert(Array.isArray(data.upcoming7Days.blocks))
    assert(Array.isArray(data.upcoming7Days.matches))

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})
