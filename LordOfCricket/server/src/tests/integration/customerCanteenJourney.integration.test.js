// Customer canteen ordering frontend migration — verifies the EXACT
// sequence of ground/canteen-scoped HTTP calls the migrated frontend now
// makes (client/src/services/customerCanteenApi.js), end to end:
// menu -> place order -> active order -> order status -> order history,
// across TWO independent grounds/canteens in the same run to prove the
// migration actually solves the "more than one canteen exists" problem
// this file exists because of (see CUSTOMER_CANTEEN_MIGRATION_INSPECTION.md).
// Every underlying guarantee (pricing, stock, tenancy, status enforcement)
// already has its own dedicated, passing test file — this file is
// specifically the customer JOURNEY, not a re-test of those guarantees.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'
import { generatePublicId } from '../../utils/publicId.js'

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
      `canteen-journey-${label}-${tag}@example.test`,
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

async function createGroundWithCanteen(ownerId, label, { groundStatus = 'ACTIVE', canteenActive = true } = {}) {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [generatePublicId('GRD', 8), `journey-ground-${tag}`, label, 'Test ground', groundStatus],
  )
  await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_OWNER',true)`, [ownerId, ground.id])
  const { rows: [canteen] } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active) VALUES ($1,$2,'Canteen',$3) RETURNING *`,
    [ground.id, generatePublicId('CAN', 8), canteenActive],
  )
  return { ground, canteen }
}

async function createMenuItem(canteenId, { name = 'Tea', price = 20, stock = 50 } = {}) {
  const { rows: [item] } = await pool.query(
    `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ($1,'Beverage',$2,$3,true,$4) RETURNING *`,
    [name, price, canteenId, stock],
  )
  return item
}

async function cleanupGround(groundId) {
  await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))', [groundId])
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_notifications WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

function base(server, ground, canteen) {
  return `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}`
}

test('CUSTOMER JOURNEY: ground -> menu -> place order -> order status -> order history, on TWO independent grounds simultaneously', async () => {
  const server = await startTestApp()
  const ownerA = await createUser('OwnerA')
  const ownerB = await createUser('OwnerB')
  const customer = await createUser('Customer')
  await elevate(customer)
  const { ground: groundA, canteen: canteenA } = await createGroundWithCanteen(ownerA.id, 'Ground A')
  const { ground: groundB, canteen: canteenB } = await createGroundWithCanteen(ownerB.id, 'Ground B')
  const itemA = await createMenuItem(canteenA.id, { name: 'Samosa', price: 15 })
  const itemB = await createMenuItem(canteenB.id, { name: 'Coffee', price: 30 })
  try {
    // 1. Ground -> Menu (GET /grounds/:g/canteens/:c/menu, both grounds independently)
    const menuAResp = await fetch(`${base(server, groundA, canteenA)}/menu`, { headers: cauth(customer) })
    assert.strictEqual(menuAResp.status, 200)
    const menuA = (await menuAResp.json()).items
    assert.ok(menuA.some((i) => i.name === 'Samosa'))

    const menuBResp = await fetch(`${base(server, groundB, canteenB)}/menu`, { headers: cauth(customer) })
    assert.strictEqual(menuBResp.status, 200)
    const menuB = (await menuBResp.json()).items
    assert.ok(menuB.some((i) => i.name === 'Coffee'))

    // 2. Cart -> Place order at Ground A's canteen (POST .../orders)
    const orderAResp = await fetch(`${base(server, groundA, canteenA)}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: itemA.id, qty: 2 }] }),
    })
    assert.strictEqual(orderAResp.status, 200)
    const orderA = (await orderAResp.json()).order
    assert.strictEqual(orderA.total, 30, 'server-computed total (15 x 2), never client-supplied')

    // The SAME customer can independently place an order at Ground B's
    // DIFFERENT canteen at the same time — proves this is genuinely
    // per-canteen, not a stale global "one active order" assumption.
    const orderBResp = await fetch(`${base(server, groundB, canteenB)}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'B1', items: [{ id: itemB.id, qty: 1 }] }),
    })
    assert.strictEqual(orderBResp.status, 200)
    const orderB = (await orderBResp.json()).order

    // 3. Order status page's self-recovery path: GET .../orders/active/:userId
    const activeAResp = await fetch(`${base(server, groundA, canteenA)}/orders/active/${customer.id}`, { headers: cauth(customer) })
    assert.strictEqual(activeAResp.status, 200)
    assert.strictEqual((await activeAResp.json()).order.id, orderA.id, 'active order at A must be A\'s order, never B\'s')

    const activeBResp = await fetch(`${base(server, groundB, canteenB)}/orders/active/${customer.id}`, { headers: cauth(customer) })
    assert.strictEqual(activeBResp.status, 200)
    assert.strictEqual((await activeBResp.json()).order.id, orderB.id)

    // 4. Order status page: GET .../orders/:id
    const fetchAResp = await fetch(`${base(server, groundA, canteenA)}/orders/${orderA.id}`, { headers: cauth(customer) })
    assert.strictEqual(fetchAResp.status, 200)
    assert.strictEqual((await fetchAResp.json()).order.id, orderA.id)

    // Cross-canteen: fetching Ground A's order through Ground B's URL must 404 (IDOR).
    const crossResp = await fetch(`${base(server, groundB, canteenB)}/orders/${orderA.id}`, { headers: cauth(customer) })
    assert.strictEqual(crossResp.status, 404)

    // 5. Mark A's order Completed (frees the "one active order" slot), then
    // order history: GET .../orders/history/:userId
    await pool.query(`UPDATE orders SET status = 'Completed', has_active_order_flag = NULL WHERE public_order_id = $1`, [orderA.id])
    const historyAResp = await fetch(`${base(server, groundA, canteenA)}/orders/history/${customer.id}`, { headers: cauth(customer) })
    assert.strictEqual(historyAResp.status, 200)
    const historyA = (await historyAResp.json()).orders
    assert.ok(historyA.some((o) => o.id === orderA.id))
    assert.ok(!historyA.some((o) => o.id === orderB.id), 'Ground A history must never include Ground B\'s order')
  } finally {
    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await customer.cleanup()
    await server.close()
  }
})

test('CUSTOMER JOURNEY edge cases: inactive canteen, closed ground, empty menu, sold-out item, invalid combination', async () => {
  const server = await startTestApp()
  const owner = await createUser('Owner')
  const customer = await createUser('Customer')
  await elevate(customer)
  const { ground: activeGround, canteen: inactiveCanteen } = await createGroundWithCanteen(owner.id, 'Ground', { canteenActive: false })
  const { ground: closedGround, canteen: canteenAtClosedGround } = await createGroundWithCanteen(owner.id, 'Closed Ground', { groundStatus: 'SUSPENDED' })
  const { ground: emptyMenuGround, canteen: emptyMenuCanteen } = await createGroundWithCanteen(owner.id, 'Empty Menu Ground')
  const { ground: soldOutGround, canteen: soldOutCanteen } = await createGroundWithCanteen(owner.id, 'Sold Out Ground')
  const soldOutItem = await createMenuItem(soldOutCanteen.id, { name: 'Last Item', stock: 1 })
  try {
    // Inactive canteen: menu still readable (staff wind-down), but ordering is rejected.
    const inactiveOrderResp = await fetch(`${base(server, activeGround, inactiveCanteen)}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: 1, qty: 1 }] }),
    })
    assert.strictEqual(inactiveOrderResp.status, 409)
    assert.strictEqual((await inactiveOrderResp.json()).code, 'CANTEEN_CLOSED')

    // Suspended ground: ordering rejected even though the canteen itself is active.
    const closedGroundOrderResp = await fetch(`${base(server, closedGround, canteenAtClosedGround)}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: 1, qty: 1 }] }),
    })
    assert.strictEqual(closedGroundOrderResp.status, 409)
    assert.strictEqual((await closedGroundOrderResp.json()).code, 'GROUND_CLOSED')

    // Empty menu: a real, valid ground/canteen with zero items — clean empty list, not an error.
    const emptyMenuResp = await fetch(`${base(server, emptyMenuGround, emptyMenuCanteen)}/menu`, { headers: cauth(customer) })
    assert.strictEqual(emptyMenuResp.status, 200)
    assert.deepEqual((await emptyMenuResp.json()).items, [])

    // Sold out: ordering more than available stock is rejected with a real reason.
    const soldOutResp = await fetch(`${base(server, soldOutGround, soldOutCanteen)}/orders`, {
      method: 'POST',
      headers: cauth(customer),
      body: JSON.stringify({ seatId: 'A1', items: [{ id: soldOutItem.id, qty: 2 }] }),
    })
    assert.strictEqual(soldOutResp.status, 409)
    assert.strictEqual((await soldOutResp.json()).code, 'INSUFFICIENT_STOCK')

    // Invalid ground/canteen combination: a real canteen id, but paired with
    // a ground it doesn't belong to.
    const invalidComboResp = await fetch(`${server.baseUrl}/grounds/${closedGround.public_ground_id}/canteens/${inactiveCanteen.public_canteen_id}/menu`, { headers: cauth(customer) })
    assert.strictEqual(invalidComboResp.status, 404)

    // Unauthenticated: no credential at all.
    const unauthResp = await fetch(`${base(server, emptyMenuGround, emptyMenuCanteen)}/orders`, {
      method: 'POST',
      body: JSON.stringify({ seatId: 'A1', items: [{ id: 1, qty: 1 }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    assert.strictEqual(unauthResp.status, 401)
  } finally {
    await cleanupGround(activeGround.id)
    await cleanupGround(closedGround.id)
    await cleanupGround(emptyMenuGround.id)
    await cleanupGround(soldOutGround.id)
    await owner.cleanup()
    await customer.cleanup()
    await server.close()
  }
})
