// Phase 17.1/17.2 — Business Data Integrity. Verifies canteen order price/
// total is always server-computed (never client-trusted), item/stock/
// availability validation, and that a SUSPENDED ground or a deactivated
// canteen correctly rejects new activity through every creation path
// (walk-in booking, ground-owner staff block, canteen order).
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
  const user = (
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`, [
      `Integration Test ${label}`,
      `pricing-${label}-${tag}@example.test`,
    ])
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

async function createOwnedGround(userId, label, status = 'ACTIVE') {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [generatePublicId('GRD', 8), `pricing-ground-${tag}`, label, 'Test ground', status],
  )
  await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_OWNER',true)`, [userId, ground.id])
  return ground
}

async function createCanteen(groundId, { isActive = true } = {}) {
  const tag = uniqueTag()
  const { rows: [canteen] } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active) VALUES ($1,$2,'Canteen',$3) RETURNING *`,
    [groundId, `CAN-${tag}`, isActive],
  )
  return canteen
}

async function createMenuItem(canteenId, { name = 'Tea', price = 20, stock = 50 } = {}) {
  const { rows: [item] } = await pool.query(
    `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ($1,'Beverage',$2,$3,true,$4) RETURNING *`,
    [name, price, canteenId, stock],
  )
  return item
}

async function publishTodayMenu(canteenId, entries) {
  const { rows: [menu] } = await pool.query(`INSERT INTO today_menu (canteen_id, published_at) VALUES ($1, NOW()) RETURNING *`, [canteenId])
  for (const [i, e] of entries.entries()) {
    await pool.query(
      `INSERT INTO today_menu_items (today_menu_id, menu_item_id, available, stock, daily_price, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [menu.id, e.menuItemId, e.available ?? true, e.stock, e.dailyPrice, i],
    )
  }
  return menu
}

async function cleanupGround(groundId) {
  await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))', [groundId])
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM today_menu_items WHERE today_menu_id IN (SELECT id FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))', [groundId])
  await pool.query('DELETE FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_bookings WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_notifications WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_audit_log WHERE entity_type = $1 AND entity_id IN (SELECT id FROM ground_pricing_slots WHERE ground_id = $2)', ['PRICING_SLOT', groundId])
  await pool.query('DELETE FROM ground_pricing_slots WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

async function orderUrl(server, ground, canteen) {
  return `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`
}

// ---------------------------------------------------------------------------
// A. Price manipulation
// ---------------------------------------------------------------------------

test('A1 — a client-supplied fake item price is ignored; server charges the real price', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerA1')
    const ground = await createOwnedGround(owner.id, 'Ground A1')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerA1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 2, price: 0.01, name: 'Free Tea' }] }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.order.total, 40, 'total must be the real 20×2, not influenced by the fake price=0.01')
    assert.strictEqual(data.order.items[0].price, 20, 'stored unit price must be the authoritative price, not the client-supplied one')
    assert.strictEqual(data.order.items[0].name, 'Tea', 'stored item name must be the authoritative name, not the client-supplied one')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('A2 — a client-supplied fake total is ignored; server total always equals sum(authoritative price × qty)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerA2')
    const ground = await createOwnedGround(owner.id, 'Ground A2')
    const canteen = await createCanteen(ground.id)
    const itemA = await createMenuItem(canteen.id, { name: 'Coffee', price: 30, stock: 10 })
    const itemB = await createMenuItem(canteen.id, { name: 'Samosa', price: 15, stock: 10 })
    const customer = await createUser('customerA2')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: itemA.id, qty: 2 }, { id: itemB.id, qty: 3 }], total: 1 }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    // 30*2 + 15*3 = 60 + 45 = 105, never the client's total: 1
    assert.strictEqual(data.order.total, 105)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('A3 — a fake client-supplied subtotal-influencing qty/price combination cannot produce a negative or zero total', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerA3')
    const ground = await createOwnedGround(owner.id, 'Ground A3')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerA3')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1, price: -999 }] }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.order.total, 20, 'a negative client price must never be used — real price applies')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// B. Menu price changes — today's published daily_price takes precedence
// ---------------------------------------------------------------------------

test('B1 — when a today-menu entry exists, its daily_price is authoritative, not the base menu_items.price', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerB1')
    const ground = await createOwnedGround(owner.id, 'Ground B1')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await publishTodayMenu(canteen.id, [{ menuItemId: item.id, stock: 10, dailyPrice: 25 }]) // today's price differs from base
    const customer = await createUser('customerB1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 2 }] }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.order.total, 50, "must use today's published daily_price (25), not the base price (20)")

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('B2 — with no today-menu published, base menu_items.price/default_stock are the authoritative fallback', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerB2')
    const ground = await createOwnedGround(owner.id, 'Ground B2')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerB2')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.order.total, 20, 'no today-menu published — base price is the honest fallback (matches the existing customer-facing menu browse behavior)')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// C. Invalid item / cross-canteen
// ---------------------------------------------------------------------------

test('C1 — cannot order an item belonging to a different canteen', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerC1')
    const groundA = await createOwnedGround(owner.id, 'Ground C1-A')
    const groundB = await createOwnedGround(owner.id, 'Ground C1-B')
    const canteenA = await createCanteen(groundA.id)
    const canteenB = await createCanteen(groundB.id)
    const itemFromB = await createMenuItem(canteenB.id, { price: 999, stock: 10 })
    const customer = await createUser('customerC1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, groundA, canteenA), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: itemFromB.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual((await res.json()).code, 'ITEM_NOT_FOUND')

    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('C2 — cannot order a deactivated (is_active=false) menu item', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerC2')
    const ground = await createOwnedGround(owner.id, 'Ground C2')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await pool.query(`UPDATE menu_items SET is_active = false WHERE id = $1`, [item.id])
    const customer = await createUser('customerC2')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual((await res.json()).code, 'ITEM_NOT_FOUND')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('C3 — cannot order an item explicitly marked unavailable in today\'s menu', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerC3')
    const ground = await createOwnedGround(owner.id, 'Ground C3')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await publishTodayMenu(canteen.id, [{ menuItemId: item.id, available: false, stock: 10, dailyPrice: 20 }])
    const customer = await createUser('customerC3')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'ITEM_UNAVAILABLE')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// D. Quantity validation
// ---------------------------------------------------------------------------

test('D1 — zero, negative, and non-integer quantities are all rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerD1')
    const ground = await createOwnedGround(owner.id, 'Ground D1')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerD1')
    await elevate(customer)

    for (const badQty of [0, -1, 1.5, 'abc']) {
      const res = await fetch(await orderUrl(server, ground, canteen), {
        method: 'POST',
        headers: cauth(customer),
        body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: badQty }] }),
      })
      assert.strictEqual(res.status, 400, `qty=${badQty} must be rejected`)
      assert.strictEqual((await res.json()).code, 'INVALID_QUANTITY')
    }

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// E. Stock validation
// ---------------------------------------------------------------------------

test('E1 — ordering more than available stock is rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerE1')
    const ground = await createOwnedGround(owner.id, 'Ground E1')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await publishTodayMenu(canteen.id, [{ menuItemId: item.id, stock: 2, dailyPrice: 20 }])
    const customer = await createUser('customerE1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 3 }] }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'INSUFFICIENT_STOCK')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('E2 — ordering exactly the available stock succeeds', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerE2')
    const ground = await createOwnedGround(owner.id, 'Ground E2')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await publishTodayMenu(canteen.id, [{ menuItemId: item.id, stock: 3, dailyPrice: 20 }])
    const customer = await createUser('customerE2')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 3 }] }),
    })
    assert.strictEqual(res.status, 200)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// F. Suspended ground — every creation path
// ---------------------------------------------------------------------------

test('F1 — suspended ground rejects a walk-in booking (service layer)', async (t) => {
  const owner = await createUser('ownerF1')
  const ground = await createOwnedGround(owner.id, 'Ground F1', 'SUSPENDED')
  const customer = await createUser('customerF1')
  try {
    const { createBooking } = await import('../../services/groundBooking.service.js')
    const dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await assert.rejects(
      () => createBooking({ dateStr, hour: 8, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id }),
      (err) => {
        assert.strictEqual(err.code, 'GROUND_CLOSED')
        return true
      },
    )
  } finally {
    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  }
})

test('F2 — suspended ground rejects a ground-owner staff block, even by the ground\'s own owner', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerF2')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground F2', 'SUSPENDED')
    const dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks`, {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ date: dateStr, hour: 8, purpose: 'Maintenance' }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'GROUND_CLOSED')

    await cleanupGround(ground.id)
    await owner.cleanup()
  } finally {
    await server.close()
  }
})

test('F3 — suspended ground rejects a team/match booking (regression check on the existing, already-working engine)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerF3')
    const ground = await createOwnedGround(owner.id, 'Ground F3', 'SUSPENDED')
    const captain = await createUser('captainF3')
    await elevate(captain)
    const team = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'TF3') RETURNING *`, [`Team F3 ${uniqueTag()}`])).rows[0]
    const player = (await pool.query(`INSERT INTO players (name, role, team_id, user_id) VALUES ('Captain F3','Batter',$1,$2) RETURNING *`, [team.id, captain.id])).rows[0]

    const dateStr = new Date(Date.now() + 86400000)
    const startTime = new Date(dateStr); startTime.setHours(8, 0, 0, 0)
    const endTime = new Date(dateStr); endTime.setHours(10, 0, 0, 0)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/bookings`, {
      method: 'POST',
      headers: cauth(captain),
      body: JSON.stringify({
        bookingPurpose: 'PRACTICE', teamId: team.id, startTime: startTime.toISOString(), endTime: endTime.toISOString(),
        participantPlayerIds: [player.id],
      }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'GROUND_CLOSED')

    await pool.query('DELETE FROM players WHERE id = $1', [player.id])
    await pool.query('DELETE FROM teams WHERE id = $1', [team.id])
    await cleanupGround(ground.id)
    await owner.cleanup()
    await captain.cleanup()
  } finally {
    await server.close()
  }
})

test('F4 — a DRAFT (never-activated) ground also rejects walk-in bookings, not just SUSPENDED', async (t) => {
  const owner = await createUser('ownerF4')
  const ground = await createOwnedGround(owner.id, 'Ground F4', 'DRAFT')
  const customer = await createUser('customerF4')
  try {
    const { createBooking } = await import('../../services/groundBooking.service.js')
    const dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await assert.rejects(
      () => createBooking({ dateStr, hour: 8, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id }),
      (err) => {
        assert.strictEqual(err.code, 'GROUND_CLOSED')
        return true
      },
    )
  } finally {
    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  }
})

test('an ACTIVE ground is unaffected — walk-in booking still succeeds normally (no regression)', async (t) => {
  const owner = await createUser('ownerFok')
  const ground = await createOwnedGround(owner.id, 'Ground Fok', 'ACTIVE')
  const customer = await createUser('customerFok')
  try {
    const { createBooking } = await import('../../services/groundBooking.service.js')
    const { createPricingSlot } = await import('../../services/groundPricing.service.js')
    // A CUSTOMER booking now requires an active pricing slot covering the
    // requested time (PRICE_UNAVAILABLE otherwise) — this fixture predates
    // that rule; give it a slot so this test exercises what it's actually
    // named for (ground-suspension logic, not pricing).
    await createPricingSlot(ground, { startTime: '06:00', endTime: '22:00', price: 500 }, owner.id)
    const dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const { booking } = await createBooking({ dateStr, hour: 8, minute: 0, userId: customer.id, customerName: 'Customer', groundId: ground.id })
    assert.ok(booking.public_booking_id)
  } finally {
    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  }
})

// ---------------------------------------------------------------------------
// G. Closed/inactive canteen
// ---------------------------------------------------------------------------

test('G1 — a deactivated canteen rejects new orders', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerG1')
    const ground = await createOwnedGround(owner.id, 'Ground G1')
    const canteen = await createCanteen(ground.id, { isActive: false })
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerG1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'CANTEEN_CLOSED')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('G2 — an active canteen at a suspended ground rejects new orders (ground status wins)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerG2')
    const ground = await createOwnedGround(owner.id, 'Ground G2', 'SUSPENDED')
    const canteen = await createCanteen(ground.id, { isActive: true })
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerG2')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'GROUND_CLOSED')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('an active canteen at an active ground is unaffected — orders still succeed normally (no regression)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerGok')
    const ground = await createOwnedGround(owner.id, 'Ground Gok')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerGok')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 200)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// H/I. Cross-ground / IDOR
// ---------------------------------------------------------------------------

test('H1 — owner A cannot suspend/manipulate ground B by any status-check bypass; ground B\'s own status alone governs', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('ownerH1A')
    const ownerB = await createUser('ownerH1B')
    const groundA = await createOwnedGround(ownerA.id, 'Ground H1-A', 'ACTIVE')
    const groundB = await createOwnedGround(ownerB.id, 'Ground H1-B', 'SUSPENDED')
    const canteenB = await createCanteen(groundB.id)
    const item = await createMenuItem(canteenB.id, { price: 20, stock: 10 })
    const customer = await createUser('customerH1')
    await elevate(customer)

    // Ordering from ground B (suspended, owned by B) via ground A's context is not even a valid URL —
    // the canteen is scoped to its own real ground_id server-side regardless of which ground segment is in the URL.
    const res = await fetch(await orderUrl(server, groundB, canteenB), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
    })
    assert.strictEqual(res.status, 409)
    assert.strictEqual((await res.json()).code, 'GROUND_CLOSED')

    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('I1 — a non-integer/garbage item id is rejected, not coerced into an unintended lookup', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerI1')
    const ground = await createOwnedGround(owner.id, 'Ground I1')
    const canteen = await createCanteen(ground.id)
    const customer = await createUser('customerI1')
    await elevate(customer)

    const res = await fetch(await orderUrl(server, ground, canteen), {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: "1 OR 1=1", qty: 1 }] }),
    })
    assert.strictEqual(res.status, 400)
    assert.strictEqual((await res.json()).code, 'ITEM_NOT_FOUND')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// J. Concurrency
// ---------------------------------------------------------------------------

test('J1 — two concurrent order attempts by the same user at the same canteen: exactly one succeeds (existing guarantee, unaffected by pricing changes)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerJ1')
    const ground = await createOwnedGround(owner.id, 'Ground J1')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    const customer = await createUser('customerJ1')
    await elevate(customer)

    const url = await orderUrl(server, ground, canteen)
    const attempt = () =>
      fetch(url, {
        method: 'POST',
        headers: cauth(customer),
        body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
      })

    const [r1, r2] = await Promise.all([attempt(), attempt()])
    const statuses = [r1.status, r2.status].sort()
    assert.deepStrictEqual(statuses, [200, 409], 'exactly one of the two concurrent orders must succeed')

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('J2 — two different users ordering the same item concurrently both succeed independently (stock is a static ceiling per order, not a depleting pool — existing, unchanged inventory model)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('ownerJ2')
    const ground = await createOwnedGround(owner.id, 'Ground J2')
    const canteen = await createCanteen(ground.id)
    const item = await createMenuItem(canteen.id, { price: 20, stock: 10 })
    await publishTodayMenu(canteen.id, [{ menuItemId: item.id, stock: 5, dailyPrice: 20 }])
    const customerA = await createUser('customerJ2A')
    await elevate(customerA)
    const customerB = await createUser('customerJ2B')
    await elevate(customerB)

    const [r1, r2] = await Promise.all([
      fetch(await orderUrl(server, ground, canteen), { method: 'POST', headers: cauth(customerA), body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 3 }] }) }),
      fetch(await orderUrl(server, ground, canteen), { method: 'POST', headers: cauth(customerB), body: JSON.stringify({ seatId: 'B1', items: [{ id: item.id, qty: 3 }] }) }),
    ])
    assert.strictEqual(r1.status, 200)
    assert.strictEqual(r2.status, 200)

    await cleanupGround(ground.id)
    await owner.cleanup()
    await customerA.cleanup()
    await customerB.cleanup()
  } finally {
    await server.close()
  }
})
