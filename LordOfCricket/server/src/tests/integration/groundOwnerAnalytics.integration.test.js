// Phase 10 — Ground Owner Analytics & Reports. Tests analytics aggregation
// for booking trends, utilization, and operational metrics over date ranges.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
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
      [`Analytics Test ${label}`, `analytics-owner-${label}-${tag}@example.test`, role],
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
  const shortSlug = `gnd${tag.slice(0, 8)}`
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *`,
    [`GRD-${tag.toUpperCase().slice(0, 8)}`, shortSlug, label, 'Test ground for analytics'],
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

// Phase 10 Tests
test('GET /ground-owner/grounds/:publicGroundId/analytics - booking analytics available', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Analytics Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`,
      { headers: cauth(owner) },
    )
    // Stale assertion tightened — this endpoint was unreachable when this
    // test was first written (Phase 9/10), wired up in the Phase 11 audit,
    // and extended with utilization/canteenRevenue in Phase 14. It has
    // returned 200 in every regression run since; the dual-status escape
    // hatch no longer reflects reality.
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok('metrics' in data && 'utilization' in data && 'canteenRevenue' in data)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('Phase 10 — analytics service structure verified', async (t) => {
  // This test verifies that the Phase 10 analytics service structure is in place
  // and can be called directly from the service layer.
  try {
    const { getBookingAnalytics, ANALYTICS_RANGES } = await import('../../services/groundOwnerAnalytics.service.js')

    assert(typeof getBookingAnalytics === 'function', 'getBookingAnalytics function exists')
    assert(ANALYTICS_RANGES.TODAY === 'TODAY', 'ANALYTICS_RANGES.TODAY defined')
    assert(ANALYTICS_RANGES.LAST_7_DAYS === 'LAST_7_DAYS', 'ANALYTICS_RANGES.LAST_7_DAYS defined')
    assert(ANALYTICS_RANGES.LAST_30_DAYS === 'LAST_30_DAYS', 'ANALYTICS_RANGES.LAST_30_DAYS defined')
  } catch (err) {
    assert.fail(`Phase 10 service structure: ${err.message}`)
  }
})

test('Phase 10 — analytics can aggregate booking data for empty ground', async (t) => {
  try {
    const { getBookingAnalytics } = await import('../../services/groundOwnerAnalytics.service.js')
    // Test with non-existent ground ID; service should return 0 bookings gracefully
    const analytics = await getBookingAnalytics(999999, 'TODAY')

    assert(analytics.metrics, 'Analytics includes metrics')
    assert(analytics.metrics.totalBookings === 0, 'Zero bookings for non-existent ground')
    assert(typeof analytics.metrics.confirmedBookings === 'number', 'confirmedBookings is a number')
    assert(typeof analytics.metrics.cancelledBookings === 'number', 'cancelledBookings is a number')
  } catch (err) {
    assert.fail(`Analytics aggregation: ${err.message}`)
  }
})
