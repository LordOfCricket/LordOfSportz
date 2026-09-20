// Phase 15 — Ground Owner Notifications & Alerts. Verifies the existing,
// mature ground_notifications system (repo/service/controller/routes/
// NotificationBell all reused, not duplicated) correctly extends to
// Ground-Owner-facing recipients: new booking, cancellation, status change,
// canteen order received/status-changed, low stock, menu not published,
// staff deactivated — plus the new ground-scoped read/mark-read/mark-all-
// read endpoints and their isolation guarantees.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { mintMfaVerifiedSessionCookie, mintStepUpGrant } from './helpers/mfaFixtures.js'

function stubIo() {
  const emitted = []
  const chain = { emit: (event, payload) => emitted.push({ event, payload }) }
  return {
    emitted,
    to: () => chain,
    emit: () => {},
  }
}

async function startTestApp(io = stubIo()) {
  const httpServer = http.createServer(app)
  app.locals.io = io
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, io, async close() { await new Promise((r) => httpServer.close(r)) } }
}

const uniqueTag = () => Math.random().toString(36).slice(2, 10)

async function createUser(label) {
  const tag = uniqueTag()
  const email = `notif-${label}-${tag}@example.test`
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
  const { cookie, sessionId } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  user.sessionId = sessionId
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

async function createOwnedGround(userId, label) {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `notif-ground-${tag}`, label, 'Test ground for notifications'],
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

async function cleanupGround(groundId) {
  await pool.query(
    `DELETE FROM today_menu_items WHERE today_menu_id IN (SELECT id FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))`,
    [groundId],
  )
  await pool.query(`DELETE FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)`, [groundId])
  await pool.query(`DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)`, [groundId])
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_bookings WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_notifications WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_audit_log WHERE entity_type = $1 AND entity_id IN (SELECT id FROM ground_pricing_slots WHERE ground_id = $2)', ['PRICING_SLOT', groundId])
  await pool.query('DELETE FROM ground_pricing_slots WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

function futureSlot(daysAhead = 1) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// 1/2 — new booking + cancellation
// ---------------------------------------------------------------------------

// POST /bookings is the legacy walk-in endpoint and always resolves to the
// platform's single "default" ground (resolveDefaultGroundId) — it has no
// way to target a specific ground from the client at all. These tests
// therefore call the service directly with an explicit groundId, exactly
// like test #3 (no-show) already does — the real, correct way to exercise
// THIS ground's notification trigger rather than whichever ground happens
// to be platform-default in a shared dev database.
test('1 — Ground Owner receives a notification when a customer creates a booking', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner1')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Booking Ground')
    const customer = await createUser('customer1')

    const { createBooking } = await import('../../services/groundBooking.service.js')
    const { createPricingSlot } = await import('../../services/groundPricing.service.js')
    // A CUSTOMER booking requires an active pricing slot covering the
    // requested time (PRICE_UNAVAILABLE otherwise) — give this fixture one.
    await createPricingSlot(ground, { startTime: '06:00', endTime: '22:00', price: 500 }, owner.id)
    const dateStr = futureSlot()
    const { booking } = await createBooking({
      dateStr, hour: 8, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id, io: server.io,
    })
    assert.ok(booking.public_booking_id)

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'GROUND_BOOKING_RECEIVED'), 'owner must receive a GROUND_BOOKING_RECEIVED notification')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('2 — Ground Owner receives a notification when a customer cancels a booking', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner2')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Cancel Ground')
    const customer = await createUser('customer2')

    const { createBooking, cancelBooking } = await import('../../services/groundBooking.service.js')
    const { createPricingSlot } = await import('../../services/groundPricing.service.js')
    await createPricingSlot(ground, { startTime: '06:00', endTime: '22:00', price: 500 }, owner.id)
    const dateStr = futureSlot()
    const { booking } = await createBooking({
      dateStr, hour: 10, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id,
    })

    const cancelled = await cancelBooking(booking.public_booking_id, { actingUserId: customer.id, isStaff: false, io: server.io })
    assert.strictEqual(cancelled.status, 'CANCELLED')

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'GROUND_BOOKING_CANCELLED'), 'owner must receive a GROUND_BOOKING_CANCELLED notification')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 3 — booking status change (no-show)
// ---------------------------------------------------------------------------

test('3 — Ground Owner receives a notification when a booking status changes (no-show)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner3')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'NoShow Ground')

    const { recordNoShow } = await import('../../services/bookingConflict.service.js')
    const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'NSA') RETURNING *`, [`NoShow Team A ${uniqueTag()}`])).rows[0]
    const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'NSB') RETURNING *`, [`NoShow Team B ${uniqueTag()}`])).rows[0]
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0)
    const end = new Date(start); end.setHours(10, 0, 0, 0)
    const { rows: [booking] } = await pool.query(
      `INSERT INTO ground_bookings (ground_id, public_booking_id, booking_type, customer_name, start_time, end_time, status, booking_purpose)
       VALUES ($1,$2,'CUSTOMER','No Show Customer',$3,$4,'CONFIRMED','MATCH') RETURNING *`,
      [ground.id, generatePublicId('LOC', 6), start, end],
    )

    await recordNoShow(booking.public_booking_id, { actingStaffId: owner.id, groundId: ground.id, io: server.io })

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'GROUND_BOOKING_STATUS_CHANGED'))

    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 4/5 — canteen order received / status changed
// ---------------------------------------------------------------------------

test('4 — Ground Owner receives a notification for a new canteen order', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner4')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Order Ground')
    const canteen = await createCanteen(ground.id)
    const customer = await createUser('customer4')
    await elevate(customer)

    // Phase 17.1 — order items are now resolved server-side against a real
    // menu item; a fake client-supplied id (the old 'x1' fixture here) is
    // correctly rejected by that new validation, so this fixture creates a
    // real one instead. This test is about the notification trigger, not
    // pricing — using a real item exercises the trigger exactly as before.
    const { rows: [item] } = await pool.query(
      `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ('Tea','Beverage',20,$1,true,50) RETURNING *`,
      [canteen.id],
    )

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 2 }] }),
    })
    assert.strictEqual(res.status, 200, JSON.stringify(await res.json()))

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'CANTEEN_ORDER_RECEIVED'))

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('5 — Ground Owner receives a notification when a canteen order status changes', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner5')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Order Status Ground')
    const canteen = await createCanteen(ground.id)
    const customer = await createUser('customer5')
    await elevate(customer)

    // Phase 17.1 — see test 4's identical comment: a real menu item
    // replaces the old fake-id fixture, which the new server-side
    // resolution correctly no longer accepts.
    const { rows: [item] } = await pool.query(
      `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ('Coffee','Beverage',30,$1,true,50) RETURNING *`,
      [canteen.id],
    )

    const createRes = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    const { order } = await createRes.json()

    const statusRes = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ status: 'Accepted' }),
    })
    assert.strictEqual(statusRes.status, 200, JSON.stringify(await statusRes.json()))

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'CANTEEN_ORDER_STATUS_CHANGED'))

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 6/7 — low stock / menu not published (on-demand, dashboard-triggered)
// ---------------------------------------------------------------------------

test('6 — low-stock notification fires when a published item is at/below threshold', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner6')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'LowStock Ground')
    const canteen = await createCanteen(ground.id)

    const { rows: [menuItem] } = await pool.query(
      `INSERT INTO menu_items (name, category, price, canteen_id) VALUES ('Samosa','Snacks',15,$1) RETURNING *`,
      [canteen.id],
    )
    const { rows: [todayMenu] } = await pool.query(`INSERT INTO today_menu (canteen_id, published_at) VALUES ($1, NOW()) RETURNING *`, [canteen.id])
    await pool.query(
      `INSERT INTO today_menu_items (today_menu_id, menu_item_id, available, stock, daily_price, sort_order) VALUES ($1,$2,true,2,15,0)`,
      [todayMenu.id, menuItem.id],
    )

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'CANTEEN_LOW_STOCK'), 'a low-stock item must trigger CANTEEN_LOW_STOCK')

    // Dedup: loading the dashboard again must NOT create a second notification for today.
    await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    const notifRes2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData2 = await notifRes2.json()
    assert.strictEqual(notifData2.notifications.filter((n) => n.type === 'CANTEEN_LOW_STOCK').length, 1, 'must not duplicate on repeated dashboard loads')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test("7 — today's-menu-not-published notification fires when a canteen has no published menu", async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner7')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'NoMenu Ground')
    await createCanteen(ground.id) // exists, but no today_menu row at all

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'CANTEEN_MENU_NOT_PUBLISHED'))

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('a ground with zero canteens never fires a false menu-not-published alert', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner7b')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'NoCanteen Ground')

    await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/dashboard`, { headers: cauth(owner) })
    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.strictEqual(notifData.total, 0, 'no canteen means nothing to have forgotten to publish')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 8 — staff deactivation
// ---------------------------------------------------------------------------

test('8 — Ground Owner receives a notification when a staff membership is deactivated', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner8')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Staff Ground')
    const staff = await createUser('staff8')
    const { rows: [membership] } = await pool.query(
      `INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_ADMIN',true) RETURNING *`,
      [staff.id, ground.id],
    )

    await mintStepUpGrant(owner.sessionId, owner.id, 'STAFF_DISABLE')
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/staff/${membership.id}/disable`, {
      method: 'PATCH',
      headers: cauth(owner),
    })
    assert.strictEqual(res.status, 200, JSON.stringify(await res.json()))

    const notifRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const notifData = await notifRes.json()
    assert.ok(notifData.notifications.some((n) => n.type === 'GROUND_STAFF_DEACTIVATED'))

    await cleanupGround(ground.id)
    await owner.cleanup()
    await staff.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 9/10/11 — auth / authorization / cross-ground isolation
// ---------------------------------------------------------------------------

test('9 — unauthenticated request rejected on all three notification endpoints', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner9')
    const ground = await createOwnedGround(owner.id, 'Ground9')

    const r1 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`)
    assert.strictEqual(r1.status, 401)
    const r2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications/1/read`, { method: 'POST' })
    assert.strictEqual(r2.status, 401)
    const r3 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications/read-all`, { method: 'POST' })
    assert.strictEqual(r3.status, 401)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('10 — non-owner rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner10')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground10')

    const stranger = await createUser('stranger10')
    await elevate(stranger)
    const strangerRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(stranger) })
    assert.strictEqual(strangerRes.status, 403)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await stranger.cleanup()
  } finally {
    await server.close()
  }
})

test('11 — cross-ground isolation: owner A cannot read/mark-read/mark-all-read owner B ground notifications', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('ownerA11')
    await elevate(ownerA)
    const ownerB = await createUser('ownerB11')
    await elevate(ownerB)
    const groundA = await createOwnedGround(ownerA.id, 'Ground A11')
    const groundB = await createOwnedGround(ownerB.id, 'Ground B11')

    // Seed a real notification for owner B.
    await pool.query(
      `INSERT INTO ground_notifications (user_id, type, title, ground_id) VALUES ($1,'GROUND_OPERATIONAL_ALERT','Test',$2) RETURNING *`,
      [ownerB.id, groundB.id],
    )
    const { rows: [bNotif] } = await pool.query(`SELECT id FROM ground_notifications WHERE user_id = $1`, [ownerB.id])

    // A cannot list B's ground notifications (403 — never even reaches the query).
    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/notifications`, { headers: cauth(ownerA) })
    assert.strictEqual(listRes.status, 403)

    // A cannot mark B's notification read by id, even via A's OWN ground context.
    const markRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.public_ground_id}/notifications/${bNotif.id}/read`, {
      method: 'POST',
      headers: cauth(ownerA),
    })
    const markData = await markRes.json()
    assert.strictEqual(markData.notification, null, "A must never be able to mark B's notification as read")

    // A cannot infer B's data by IDOR through groundId — mark-all-read on A's own ground never touches B's row.
    await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.public_ground_id}/notifications/read-all`, { method: 'POST', headers: cauth(ownerA) })
    const { rows: [stillUnread] } = await pool.query(`SELECT is_read FROM ground_notifications WHERE id = $1`, [bNotif.id])
    assert.strictEqual(stillUnread.is_read, false, "owner A's mark-all-read must never affect owner B's notification")

    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 12/13/14 — read / mark-all-read / unread count
// ---------------------------------------------------------------------------

test('12/13/14 — notification read, mark-all-read, and unread count all behave correctly', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner12')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground12')

    await pool.query(`INSERT INTO ground_notifications (user_id, type, title, ground_id) VALUES ($1,'GROUND_OPERATIONAL_ALERT','A',$2)`, [owner.id, ground.id])
    await pool.query(`INSERT INTO ground_notifications (user_id, type, title, ground_id) VALUES ($1,'GROUND_OPERATIONAL_ALERT','B',$2)`, [owner.id, ground.id])

    const listRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    const listData = await listRes.json()
    assert.strictEqual(listData.unreadCount, 2)
    assert.strictEqual(listData.total, 2)

    const oneId = listData.notifications[0].id
    const readRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications/${oneId}/read`, {
      method: 'POST',
      headers: cauth(owner),
    })
    assert.strictEqual(readRes.status, 200)
    assert.strictEqual((await readRes.json()).notification.is_read, true)

    const afterOne = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    assert.strictEqual((await afterOne.json()).unreadCount, 1)

    const markAllRes = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications/read-all`, {
      method: 'POST',
      headers: cauth(owner),
    })
    assert.strictEqual(markAllRes.status, 200)

    const afterAll = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/notifications`, { headers: cauth(owner) })
    assert.strictEqual((await afterAll.json()).unreadCount, 0)

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test("mark-all-read only affects THIS owner's THIS ground, not their other grounds", async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-multi')
    await elevate(owner)
    const groundA = await createOwnedGround(owner.id, 'Multi A')
    const groundB = await createOwnedGround(owner.id, 'Multi B')

    await pool.query(`INSERT INTO ground_notifications (user_id, type, title, ground_id) VALUES ($1,'GROUND_OPERATIONAL_ALERT','A',$2)`, [owner.id, groundA.id])
    await pool.query(`INSERT INTO ground_notifications (user_id, type, title, ground_id) VALUES ($1,'GROUND_OPERATIONAL_ALERT','B',$2)`, [owner.id, groundB.id])

    await fetch(`${server.baseUrl}/ground-owner/grounds/${groundA.public_ground_id}/notifications/read-all`, { method: 'POST', headers: cauth(owner) })

    const bList = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/notifications`, { headers: cauth(owner) })
    assert.strictEqual((await bList.json()).unreadCount, 1, "marking Ground A read-all must not touch Ground B's notifications")

    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 15 — socket delivery
// ---------------------------------------------------------------------------

test('15 — a created notification is published to the io.to(user:{id}) room', async (t) => {
  const io = stubIo()
  const server = await startTestApp(io)
  try {
    const owner = await createUser('owner15')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Socket Ground')
    const customer = await createUser('customer15')

    const { createBooking } = await import('../../services/groundBooking.service.js')
    const { createPricingSlot } = await import('../../services/groundPricing.service.js')
    await createPricingSlot(ground, { startTime: '06:00', endTime: '22:00', price: 500 }, owner.id)
    const dateStr = futureSlot()
    await createBooking({ dateStr, hour: 14, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id, io: server.io })

    assert.ok(io.emitted.some((e) => e.event === 'notification:new'), 'a Socket.IO notification:new event must be published')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// 16 — existing notification types remain functional (regression)
// ---------------------------------------------------------------------------

test('16 — existing (pre-Phase-15) notification types and the global inbox endpoint still work unchanged', async (t) => {
  const server = await startTestApp()
  try {
    const player = await createUser('player16')
    await pool.query(`INSERT INTO ground_notifications (user_id, type, title, body) VALUES ($1,'BOOKING_APPROVED','Booking confirmed','Test')`, [player.id])

    const res = await fetch(`${server.baseUrl}/ground/notifications`, { headers: { Authorization: `Bearer ${player.token}` } })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(data.notifications.some((n) => n.type === 'BOOKING_APPROVED'))
    // Phase 15 additive field, null for a notification with no ground_id — pre-existing types are unaffected.
    assert.strictEqual(data.notifications.find((n) => n.type === 'BOOKING_APPROVED').ground_public_id, null)

    await player.cleanup()
  } finally {
    await server.close()
  }
})
