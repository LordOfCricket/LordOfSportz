// Phase 16 — Ground Owner Dashboard Intelligence & Analytics UI. Verifies
// the day-by-day trend series (GET .../analytics/trends) and the extended
// Phase 9 dashboard (canteen snapshot, staff summary, current/next booking,
// available/blocked slots) — all additive to existing, already-tested
// endpoints, reusing Phase 10/14's own revenue/utilization definitions.
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

async function createUser(label) {
  const tag = uniqueTag()
  const email = `dashintel-${label}-${tag}@example.test`
  const user = (
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`, [
      `Integration Test ${label}`,
      email,
    ])
  ).rows[0]
  return {
    id: user.id,
    email,
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

async function createOwnedGround(userId, label) {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `dashintel-ground-${tag}`, label, 'Test ground'],
  )
  await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_OWNER',true)`, [userId, ground.id])
  return ground
}

async function createCanteen(groundId, label = 'Canteen') {
  const tag = uniqueTag()
  const { rows: [canteen] } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active) VALUES ($1,$2,$3,true) RETURNING *`,
    [groundId, `CAN-${tag}`, label],
  )
  return canteen
}

async function createOrder(canteenId, { total, status = 'Completed', orderedAt = new Date(), userId }) {
  const { rows: [order] } = await pool.query(
    `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, ordered_at)
     VALUES ($1,$2,$3,'Test Customer','A1',$4,$5,$6) RETURNING *`,
    [generatePublicId('ORD', 8), userId, canteenId, total, status, orderedAt],
  )
  return order
}

async function createBooking(groundId, { startTime, endTime, status = 'CONFIRMED' }) {
  const { rows: [booking] } = await pool.query(
    `INSERT INTO ground_bookings (ground_id, public_booking_id, booking_type, customer_name, start_time, end_time, status)
     VALUES ($1,$2,'CUSTOMER','Test Customer',$3,$4,$5) RETURNING *`,
    [groundId, generatePublicId('LOC', 6), startTime, endTime, status],
  )
  return booking
}

async function cleanupGround(groundId) {
  await pool.query(
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))`,
    [groundId],
  )
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query(
    `DELETE FROM today_menu_items WHERE today_menu_id IN (SELECT id FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))`,
    [groundId],
  )
  await pool.query('DELETE FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_bookings WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_notifications WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

function todayAt(hour, minute = 0) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// Trends — auth / authorization / ground isolation
// ---------------------------------------------------------------------------

test('trends: unauthenticated rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-t-unauth')
    const ground = await createOwnedGround(owner.id, 'Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/trends`)
    assert.strictEqual(res.status, 401)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('trends: non-owner rejected, owner A cannot read owner B trends', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('owner-t-A')
    await elevate(ownerA)
    const ownerB = await createUser('owner-t-B')
    await elevate(ownerB)
    const groundB = await createOwnedGround(ownerB.id, 'Ground B')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/analytics/trends`, { headers: cauth(ownerA) })
    assert.strictEqual(res.status, 403)

    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Trends — correctness with a known fixture
// ---------------------------------------------------------------------------

test('trends: booking count and canteen revenue reflect a known fixture, on the correct day', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-t-fixture')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Trend Ground')
    const canteen = await createCanteen(ground.id)
    const customer = await createUser('customer-t-fixture')

    await createBooking(ground.id, { startTime: todayAt(8, 0), endTime: todayAt(10, 0) })
    await createOrder(canteen.id, { total: 250, status: 'Completed', userId: customer.id })
    await createOrder(canteen.id, { total: 999, status: 'Cancelled', userId: customer.id }) // must not count

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/trends?range=TODAY`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.days.length, 1)
    assert.strictEqual(data.days[0].bookingCount, 1)
    assert.strictEqual(data.days[0].canteenRevenue, 250)
    assert.ok(data.days[0].utilizedPercentage > 0)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('trends: a value outside the selected range is excluded (date-range filtering)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-t-range')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Range Ground')

    const oldDate = new Date(); oldDate.setDate(oldDate.getDate() - 40)
    const oldStart = new Date(oldDate); oldStart.setHours(8, 0, 0, 0)
    const oldEnd = new Date(oldDate); oldEnd.setHours(10, 0, 0, 0)
    await createBooking(ground.id, { startTime: oldStart, endTime: oldEnd })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/trends?range=LAST_30_DAYS`, { headers: cauth(owner) })
    const data = await res.json()
    const totalBookings = data.days.reduce((sum, d) => sum + d.bookingCount, 0)
    assert.strictEqual(totalBookings, 0, 'a booking 40 days ago must not appear in a 30-day trend')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('trends: empty ground produces a full zero series, never NaN/Infinity, correct day count', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-t-empty')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Empty Trend Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/trends?range=LAST_7_DAYS`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const raw = await res.text()
    assert.ok(!raw.includes('NaN') && !raw.includes('Infinity'))
    const data = JSON.parse(raw)
    assert.strictEqual(data.days.length, 8) // inclusive range: today - 7 .. today
    assert.ok(data.days.every((d) => d.bookingCount === 0 && d.canteenRevenue === 0 && d.utilizedPercentage === 0))

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Extended dashboard — canteen snapshot, staff summary, isolation
// ---------------------------------------------------------------------------

test('dashboard: canteen snapshot reflects orders-by-status, revenue, and top items for a known fixture', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-d-canteen')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Canteen Dash Ground')
    const canteen = await createCanteen(ground.id)
    const customer = await createUser('customer-d-canteen')

    await createOrder(canteen.id, { total: 100, status: 'Completed', userId: customer.id })
    await createOrder(canteen.id, { total: 50, status: 'Pending', userId: customer.id })
    await pool.query(
      `INSERT INTO order_items (order_id, menu_item_id, raw_item_id, item_name, unit_price, quantity)
       SELECT id, NULL, 'x1', 'Chai', 10, 3 FROM orders WHERE canteen_id = $1 AND status = 'Completed' LIMIT 1`,
      [canteen.id],
    )

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.canteen.revenue, 100)
    assert.strictEqual(data.canteen.orderCount, 1)
    assert.strictEqual(data.canteen.ordersByStatus.Pending, 1)
    assert.strictEqual(data.canteen.ordersByStatus.Completed, 1)
    assert.ok(data.canteen.topItems.some((i) => i.name === 'Chai' && i.quantitySold === 3))

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('dashboard: low-stock items appear with real names via the menu_items join', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-d-stock')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Stock Dash Ground')
    const canteen = await createCanteen(ground.id)

    const { rows: [item] } = await pool.query(`INSERT INTO menu_items (name, category, price, canteen_id) VALUES ('Vada Pav','Snacks',20,$1) RETURNING *`, [canteen.id])
    const { rows: [todayMenu] } = await pool.query(`INSERT INTO today_menu (canteen_id, published_at) VALUES ($1, NOW()) RETURNING *`, [canteen.id])
    await pool.query(`INSERT INTO today_menu_items (today_menu_id, menu_item_id, available, stock, daily_price, sort_order) VALUES ($1,$2,true,1,20,0)`, [todayMenu.id, item.id])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    const data = await res.json()
    assert.ok(data.canteen.lowStockItems.some((i) => i.name === 'Vada Pav' && i.stock === 1))

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('dashboard: staff summary reports active/inactive counts and role breakdown correctly', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-d-staff')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Staff Dash Ground')
    const s1 = await createUser('s1')
    const s2 = await createUser('s2')
    const s3 = await createUser('s3')
    await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_ADMIN',true)`, [s1.id, ground.id])
    await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'CANTEEN_STAFF',true)`, [s2.id, ground.id])
    await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_ADMIN',false)`, [s3.id, ground.id])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.staff.active, 2)
    assert.strictEqual(data.staff.inactive, 1)
    assert.strictEqual(data.staff.roleBreakdown.GROUND_ADMIN, 2)
    assert.strictEqual(data.staff.roleBreakdown.CANTEEN_STAFF, 1)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await s1.cleanup()
    await s2.cleanup()
    await s3.cleanup()
  } finally {
    await server.close()
  }
})

test('dashboard: current/next booking derived correctly from today.bookings', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-d-current')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Current Dash Ground')

    const now = new Date()
    const currentStart = new Date(now.getTime() - 30 * 60000)
    const currentEnd = new Date(now.getTime() + 30 * 60000)
    const nextStart = new Date(now.getTime() + 90 * 60000)
    const nextEnd = new Date(now.getTime() + 150 * 60000)
    await createBooking(ground.id, { startTime: currentStart, endTime: currentEnd })
    await createBooking(ground.id, { startTime: nextStart, endTime: nextEnd })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    const data = await res.json()
    assert.ok(data.today.currentBooking, 'a booking spanning right now must be the current booking')
    assert.ok(data.today.nextBooking, 'a future booking today must be the next booking')
    assert.notStrictEqual(data.today.currentBooking.publicBookingId, data.today.nextBooking.publicBookingId)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('dashboard/trends: cross-ground isolation — owner A never sees owner B canteen/staff data', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('owner-iso-A')
    await elevate(ownerA)
    const ownerB = await createUser('owner-iso-B')
    await elevate(ownerB)
    const groundB = await createOwnedGround(ownerB.id, 'Iso Ground B')
    const canteenB = await createCanteen(groundB.id)
    const customer = await createUser('customer-iso')
    await createOrder(canteenB.id, { total: 5000, status: 'Completed', userId: customer.id })

    const dashRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/dashboard`, { headers: cauth(ownerA) })
    assert.strictEqual(dashRes.status, 403)
    const trendsRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/analytics/trends`, { headers: cauth(ownerA) })
    assert.strictEqual(trendsRes.status, 403)

    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('dashboard: empty ground produces zero-state canteen/staff sections, never an error', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-d-empty')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Empty Dash Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.canteen.revenue, 0)
    assert.strictEqual(data.canteen.orderCount, 0)
    assert.deepStrictEqual(data.canteen.topItems, [])
    assert.deepStrictEqual(data.canteen.lowStockItems, [])
    assert.strictEqual(data.staff.active, 0)
    assert.strictEqual(data.staff.inactive, 0)
    assert.strictEqual(data.today.currentBooking, null)
    assert.strictEqual(data.today.nextBooking, null)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('privilege escalation: a fully-permissioned GROUND_ADMIN staff member still cannot read dashboard/trends', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-esc')
    const staff = await createUser('staff-esc')
    await elevate(staff)
    const ground = await createOwnedGround(owner.id, 'Escalation Ground')

    const { rows: [membership] } = await pool.query(
      `INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_ADMIN',true) RETURNING *`,
      [staff.id, ground.id],
    )
    const perms = (await pool.query(`SELECT id FROM permissions WHERE is_active = true`)).rows
    for (const p of perms) {
      await pool.query(`INSERT INTO staff_permissions (ground_user_id, permission_id, granted_by) VALUES ($1,$2,$3)`, [membership.id, p.id, owner.id])
    }

    const dashRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(staff) })
    assert.strictEqual(dashRes.status, 403)
    const trendsRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/trends`, { headers: cauth(staff) })
    assert.strictEqual(trendsRes.status, 403)

    await pool.query('DELETE FROM staff_permissions WHERE ground_user_id = $1', [membership.id])
    await cleanupGround(ground.id)
    await owner.cleanup()
    await staff.cleanup()
  } finally {
    await server.close()
  }
})
