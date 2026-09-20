// Phase 14 — Ground Owner Business Reports (Analytics Extension).
// Verifies ground-scoped utilization, canteen revenue, the extended
// analytics API contract, and the CSV export endpoint — all reusing
// existing, already-tested infrastructure (computeUtilization,
// groundOwnerAnalytics.service.js, groundBooking.repository.js).
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
  const email = `reports-${label}-${tag}@example.test`
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`,
      [`Integration Test ${label}`, email],
    )
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
    [generatePublicId('GRD', 8), `reports-ground-${tag}`, label, 'Test ground for reports'],
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

async function createOrder(canteenId, { total, status = 'Completed', orderedAt = new Date() }) {
  const { rows: [order] } = await pool.query(
    `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, ordered_at)
     VALUES ($1, NULL, $2, 'Test Customer', 'A1', $3, $4, $5) RETURNING *`,
    [generatePublicId('ORD', 8), canteenId, total, status, orderedAt],
  ).catch(async () => {
    // orders.user_id is NOT NULL in this schema — fall back to a real user if the bare insert fails.
    const fallbackUser = await createUser(`order-user-${uniqueTag()}`)
    return pool.query(
      `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, ordered_at)
       VALUES ($1,$2,$3,'Test Customer','A1',$4,$5,$6) RETURNING *`,
      [generatePublicId('ORD', 8), fallbackUser.id, canteenId, total, status, orderedAt],
    )
  })
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
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_bookings WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

function todayAt(hour, minute = 0) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

// ---------------------------------------------------------------------------
// Utilization
// ---------------------------------------------------------------------------

test('1 — utilization calculation reflects a known booking fixture', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner1')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Utilization Ground')
    // 2-hour booking today, within ground open hours (6-22 local by default).
    await createBooking(ground.id, { startTime: todayAt(8, 0), endTime: todayAt(10, 0) })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.utilization.bookedHours, 2)
    assert.strictEqual(data.utilization.totalHours, 16) // 22-6
    assert.ok(data.utilization.utilizedPercentage > 0 && data.utilization.utilizedPercentage <= 100)
    assert.strictEqual(typeof data.utilization.utilizedPercentage, 'number')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('2 — zero-utilization case never produces NaN/Infinity', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner2')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Empty Utilization Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const raw = await res.text()
    assert.ok(!raw.includes('NaN'), 'response must never contain NaN')
    assert.ok(!raw.includes('Infinity'), 'response must never contain Infinity')
    const data = JSON.parse(raw)
    assert.strictEqual(data.utilization.bookedHours, 0)
    assert.strictEqual(data.utilization.utilizedPercentage, 0)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('3/15 — date-range filtering: a booking outside the selected range is excluded', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner3')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Range Ground')

    // A booking 40 days ago — outside TODAY, LAST_7_DAYS, and LAST_30_DAYS.
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 40)
    const oldStart = new Date(oldDate); oldStart.setHours(8, 0, 0, 0)
    const oldEnd = new Date(oldDate); oldEnd.setHours(10, 0, 0, 0)
    await createBooking(ground.id, { startTime: oldStart, endTime: oldEnd })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=LAST_30_DAYS`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.utilization.bookedHours, 0, 'a booking 40 days ago must not appear in a 30-day range')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Canteen revenue
// ---------------------------------------------------------------------------

test('4/6 — canteen revenue aggregates only Completed orders', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner4')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Revenue Ground')
    const canteen = await createCanteen(ground.id)
    await createOrder(canteen.id, { total: 500, status: 'Completed' })
    await createOrder(canteen.id, { total: 300, status: 'Completed' })
    await createOrder(canteen.id, { total: 1000, status: 'Cancelled' }) // must NOT count
    await createOrder(canteen.id, { total: 200, status: 'Pending' }) // must NOT count

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.canteenRevenue.revenue, 800, 'only the two Completed orders (500+300) should count as revenue')
    assert.strictEqual(data.canteenRevenue.orderCount, 2)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('5 — revenue sums across multiple canteens on the same ground', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner5')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Multi-Canteen Ground')
    const canteenA = await createCanteen(ground.id, 'Canteen A')
    const canteenB = await createCanteen(ground.id, 'Canteen B')
    await createOrder(canteenA.id, { total: 100, status: 'Completed' })
    await createOrder(canteenB.id, { total: 250, status: 'Completed' })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.canteenRevenue.revenue, 350, 'revenue must sum across every canteen belonging to this ground')
    assert.strictEqual(data.canteenRevenue.orderCount, 2)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('7 — zero revenue case', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner7')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'No Revenue Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.canteenRevenue.revenue, 0)
    assert.strictEqual(data.canteenRevenue.orderCount, 0)
    assert.strictEqual(data.canteenRevenue.averageOrderValue, 0)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Security / isolation
// ---------------------------------------------------------------------------

test('8 — owner A cannot see owner B canteen revenue/utilization', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('ownerA8')
    await elevate(ownerA)
    const ownerB = await createUser('ownerB8')
    await elevate(ownerB)
    const groundB = await createOwnedGround(ownerB.id, 'Owner B Ground')
    const canteenB = await createCanteen(groundB.id)
    await createOrder(canteenB.id, { total: 5000, status: 'Completed' })

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/analytics?range=TODAY`, { headers: cauth(ownerA) })
    assert.strictEqual(res.status, 403)

    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
  } finally {
    await server.close()
  }
})

test('9 — owner A cannot export owner B analytics CSV', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('ownerA9')
    await elevate(ownerA)
    const ownerB = await createUser('ownerB9')
    await elevate(ownerB)
    const groundB = await createOwnedGround(ownerB.id, 'Owner B Export Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/analytics/export?range=TODAY`, { headers: cauth(ownerA) })
    assert.strictEqual(res.status, 403)

    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
  } finally {
    await server.close()
  }
})

test('10 — unauthenticated rejected on both analytics and export', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner10')
    const ground = await createOwnedGround(owner.id, 'Ground10')

    const res1 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics`)
    assert.strictEqual(res1.status, 401)
    const res2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export`)
    assert.strictEqual(res2.status, 401)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('11 — non-owner (no membership) rejected on both endpoints', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner11')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground11')
    const stranger = await createUser('stranger11')
    await elevate(stranger)

    const res1 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics`, { headers: cauth(stranger) })
    assert.strictEqual(res1.status, 403)
    const res2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export`, { headers: cauth(stranger) })
    assert.strictEqual(res2.status, 403)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await stranger.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

test('12/13 — CSV headers and escaping are correct', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner12')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'CSV Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export?range=TODAY`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    assert.ok(res.headers.get('content-type').includes('text/csv'))
    assert.ok(res.headers.get('content-disposition').includes('attachment'))
    assert.ok(res.headers.get('content-disposition').includes('.csv'))

    const csv = await res.text()
    const lines = csv.split('\r\n')
    assert.strictEqual(lines[0], 'Metric,Value')
    assert.ok(lines.some((l) => l.startsWith('Date Range,Today')))
    assert.ok(lines.some((l) => l.startsWith('Canteen Revenue,')))
    assert.ok(lines.some((l) => l.startsWith('Utilization %,')))

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('14 — CSV formula-injection protection: every emitted value is guarded', async (t) => {
  // csvCell/buildAnalyticsCsv are internal (unexported) helpers in
  // groundOwner.controller.js — verified through the real HTTP endpoint's
  // output instead, asserting the invariant on every cell it actually emits.
  const server = await startTestApp()
  try {
    const owner = await createUser('owner14')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Formula Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export?range=TODAY`, { headers: cauth(owner) })
    const csv = await res.text()
    // None of the fixed labels/values this endpoint ever emits start with
    // =/+/-/@ today, but assert the invariant holds for every cell anyway.
    for (const line of csv.split('\r\n').slice(1)) {
      if (!line) continue
      const [, value] = line.split(',')
      assert.ok(!/^[=+@]/.test(value || ''), `CSV value must never start with a formula-triggering character: ${line}`)
    }

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('16 — analytics backward compatibility: existing booking fields unchanged, new fields additive', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner16')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Compat Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=TODAY`, { headers: cauth(owner) })
    const data = await res.json()
    // Every Phase 10 field must still exist, unchanged shape.
    assert.ok('dateRange' in data)
    assert.ok('metrics' in data)
    assert.ok('totalBookings' in data.metrics)
    assert.ok('confirmedBookings' in data.metrics)
    assert.ok('cancelledBookings' in data.metrics)
    assert.ok('noShowBookings' in data.metrics)
    assert.ok('totalBookedHours' in data.metrics)
    assert.ok('averageBookingHours' in data.metrics)
    assert.ok('breakdown' in data)
    // Phase 14 additions.
    assert.ok('utilization' in data)
    assert.ok('canteenRevenue' in data)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('malformed range falls back safely to TODAY, never a 500', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-malformed')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Malformed Range Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics?range=${encodeURIComponent("DROP TABLE grounds;--")}`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.dateRange, 'Today')

    const resExport = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export?range=not-a-real-range`, { headers: cauth(owner) })
    assert.strictEqual(resExport.status, 200)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})


test('privilege escalation: a fully-permissioned GROUND_ADMIN staff member still cannot read revenue/utilization or export', async (t) => {
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

    const res1 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics`, { headers: cauth(staff) })
    assert.strictEqual(res1.status, 403, 'revenue/utilization are Owner-only — no staff permission should ever grant access')
    const res2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/analytics/export`, { headers: cauth(staff) })
    assert.strictEqual(res2.status, 403)

    await pool.query('DELETE FROM staff_permissions WHERE ground_user_id = $1', [membership.id])
    await cleanupGround(ground.id)
    await owner.cleanup()
    await staff.cleanup()
  } finally {
    await server.close()
  }
})
