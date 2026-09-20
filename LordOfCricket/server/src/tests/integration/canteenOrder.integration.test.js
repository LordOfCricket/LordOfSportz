// MongoDB cleanup, Phase 5 (final feature) — Order is now PostgreSQL-backed
// (orders + order_items, server/src/models/canteenOrder.model.js). Real HTTP
// pattern matching every other Phase 1-4 integration test: a real
// http.createServer(app) on a random port, plain fetch(). Every test here
// uses DISPOSABLE test users (never the real production user id whose 2
// real historical orders already live in this database) — so, unlike
// Phase 3A/4's TodayMenu singleton, there is no snapshot/restore needed for
// Order data itself; test isolation here means "use your own user_id and
// clean up your own rows," verified explicitly at the end of this file by
// confirming the real orders are still exactly 2.
//
// This file supersedes canteenOrderConcurrency.integration.test.js's
// MongoDB-specific assertions (E11000, hasActiveOrderFlag) with the
// PostgreSQL equivalents — the old file is left in place (it now
// legitimately tests the RETIRED Mongo model, still valid as a Mongoose-
// level regression check since that file/model still exists for rollback).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import mongoose from 'mongoose'
import app from '../../app.js'
import { pool, connectMongo } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import OrderMongo from '../../models/canteenOrderMongoLegacy.model.js'
import { insertOrder, findActiveOrderByUserId } from '../../models/canteenOrder.model.js'
import { findSingleCanteen } from '../../models/canteen.model.js'
import { runOrderMigration } from '../../scripts/migrateOrdersToPostgres.js'

await connectMongo()

// Phase 10 — every order is now canteen-scoped; direct model-layer/raw-SQL
// calls in this file need the real (single, Phase 8-seeded) canteen id the
// live HTTP endpoints resolve automatically via attachCurrentCanteen.
const canteen = await findSingleCanteen()

function stubIo() {
  const chain = { emit: () => {} }
  return { emit: () => {}, to: () => chain }
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = stubIo()
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function createUser(label = 'player') {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', 'player') RETURNING *`,
      [`Integration Test ${label}`, `integration-test-order-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    name: user.name,
    async cleanup() {
      await pool.query('DELETE FROM orders WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createStaffUser() {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Integration Test Staff', $1, 'not-a-real-hash', 'staff') RETURNING *`,
      [`integration-test-order-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function sampleItems() {
  return [{ id: '1', foodId: '1', name: 'Pizza', price: 109, qty: 2 }]
}

async function placeOrder(baseUrl, token, items = sampleItems(), seatId = 'A1') {
  const res = await fetch(`${baseUrl}/canteen/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatId, items, total: items.reduce((s, i) => s + i.price * i.qty, 0) }),
  })
  const body = await res.json()
  return { status: res.status, body }
}

// ---------------------------------------------------------------------------
// Auth / RBAC
// ---------------------------------------------------------------------------

test('createOrder without auth is rejected (401)', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: sampleItems(), total: 218 }),
    })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('staff-only endpoints reject a plain player', async () => {
  const server = await startTestApp()
  const player = await createUser('rbac')
  try {
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders`, { headers: { Authorization: `Bearer ${player.token}` } })).status, 403)
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/lookup?userId=${player.id}`, { headers: { Authorization: `Bearer ${player.token}` } })).status, 403)
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/some-id`, { headers: { Authorization: `Bearer ${player.token}` } })).status, 403)
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/some-id/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${player.token}`, 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  } finally {
    await player.cleanup()
    await server.close()
  }
})

test('a player cannot view another player\'s active order or history (403), staff can', async () => {
  const server = await startTestApp()
  const player = await createUser('privacy-a')
  const otherPlayer = await createUser('privacy-b')
  const staff = await createStaffUser()
  try {
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/active/${otherPlayer.id}`, { headers: { Authorization: `Bearer ${player.token}` } })).status, 403)
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/history/${otherPlayer.id}`, { headers: { Authorization: `Bearer ${player.token}` } })).status, 403)
    assert.equal((await fetch(`${server.baseUrl}/canteen/orders/active/${otherPlayer.id}`, { headers: { Authorization: `Bearer ${staff.token}` } })).status, 200)
  } finally {
    await player.cleanup()
    await otherPlayer.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// CRUD + response-shape preservation
// ---------------------------------------------------------------------------

test('placing an order returns the preserved response shape, and it is retrievable by staff via its public id', async () => {
  const server = await startTestApp()
  const player = await createUser('crud')
  const staff = await createStaffUser()
  try {
    const { status, body } = await placeOrder(server.baseUrl, player.token, [
      { id: '1', foodId: '1', name: 'Pizza', price: 109, qty: 2 },
      { id: '3', foodId: '3', name: 'Burger', price: 46, qty: 1 },
    ])
    assert.equal(status, 200)
    const order = body.order
    assert.equal(typeof order.id, 'string')
    assert.match(order.id, /^ORD-/, 'public order id must not be the raw internal integer PK')
    assert.equal(order.userId, player.id)
    assert.equal(order.customerName, player.name)
    assert.equal(order.seatId, 'A1')
    assert.equal(order.status, 'Pending')
    assert.equal(order.total, 264)
    assert.equal(order.completedAt, null)
    assert.ok(order.orderedAt)
    assert.equal(order.items.length, 2)
    assert.deepEqual(order.items[0], { id: '1', foodId: '1', name: 'Pizza', price: 109, qty: 2 })
    assert.deepEqual(order.items[1], { id: '3', foodId: '3', name: 'Burger', price: 46, qty: 1 })
    // legacy_mongo_id / internal fields must never leak.
    assert.equal(order.legacyMongoId, undefined)
    assert.equal(order.legacy_mongo_id, undefined)
    assert.equal(order.hasActiveOrderFlag, undefined)

    const getRes = await fetch(`${server.baseUrl}/canteen/orders/${order.id}`, { headers: { Authorization: `Bearer ${staff.token}` } })
    assert.equal(getRes.status, 200)
    const fetched = (await getRes.json()).order
    assert.equal(fetched.id, order.id)
    assert.equal(fetched.items.length, 2)
  } finally {
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

test('getOrder with an unknown public order id is a clean 404, never a 500', async () => {
  const server = await startTestApp()
  const staff = await createStaffUser()
  try {
    const res = await fetch(`${server.baseUrl}/canteen/orders/ORD-DOESNOTEXIST`, { headers: { Authorization: `Bearer ${staff.token}` } })
    assert.equal(res.status, 404)
  } finally {
    await staff.cleanup()
    await server.close()
  }
})

test('empty or missing items array is rejected with 400', async () => {
  const server = await startTestApp()
  const player = await createUser('validation')
  try {
    const res = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${player.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [], total: 0 }),
    })
    assert.equal(res.status, 400)
  } finally {
    await player.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Active-order rule + status transitions (Steps 5, 24, 25, 26)
// ---------------------------------------------------------------------------

test('a second order while one is active is rejected (409) with the existing active order attached', async () => {
  const server = await startTestApp()
  const player = await createUser('active-rule')
  try {
    const first = await placeOrder(server.baseUrl, player.token)
    assert.equal(first.status, 200)

    const second = await placeOrder(server.baseUrl, player.token)
    assert.equal(second.status, 409)
    assert.equal(second.body.order.id, first.body.order.id)
  } finally {
    await player.cleanup()
    await server.close()
  }
})

test('status transitions: Pending -> Preparing -> Ready -> Completed all succeed and stamp completedAt only at the end', async () => {
  const server = await startTestApp()
  const player = await createUser('transitions')
  const staff = await createStaffUser()
  try {
    const { body } = await placeOrder(server.baseUrl, player.token)
    const id = body.order.id

    for (const status of ['Preparing', 'Ready']) {
      const res = await fetch(`${server.baseUrl}/canteen/orders/${id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      assert.equal(res.status, 200)
      const updated = (await res.json()).order
      assert.equal(updated.status, status)
      assert.equal(updated.completedAt, null, `${status} must not stamp completedAt`)
    }

    const completeRes = await fetch(`${server.baseUrl}/canteen/orders/${id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' }),
    })
    const completed = (await completeRes.json()).order
    assert.equal(completed.status, 'Completed')
    assert.ok(completed.completedAt, 'Completed must stamp completedAt')
  } finally {
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

test('an unrecognized status is rejected with 400, never silently accepted', async () => {
  const server = await startTestApp()
  const player = await createUser('bad-status')
  const staff = await createStaffUser()
  try {
    const { body } = await placeOrder(server.baseUrl, player.token)
    const res = await fetch(`${server.baseUrl}/canteen/orders/${body.order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'NotARealStatus' }),
    })
    assert.equal(res.status, 400)
  } finally {
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

test('once Completed, the user may immediately place a new order (Case 4)', async () => {
  const server = await startTestApp()
  const player = await createUser('after-complete')
  const staff = await createStaffUser()
  try {
    const first = await placeOrder(server.baseUrl, player.token)
    await fetch(`${server.baseUrl}/canteen/orders/${first.body.order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' }),
    })

    const second = await placeOrder(server.baseUrl, player.token)
    assert.equal(second.status, 200, 'a new order must be allowed once the previous one is Completed')
    assert.notEqual(second.body.order.id, first.body.order.id)
  } finally {
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

test('once Cancelled, the user may immediately place a new order (Case 5)', async () => {
  const server = await startTestApp()
  const player = await createUser('after-cancel')
  const staff = await createStaffUser()
  try {
    const first = await placeOrder(server.baseUrl, player.token)
    const cancelRes = await fetch(`${server.baseUrl}/canteen/orders/${first.body.order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    const cancelled = (await cancelRes.json()).order
    assert.equal(cancelled.status, 'Cancelled')
    assert.ok(cancelled.completedAt, 'Cancelled also stamps completedAt — the retired code never had a separate cancelledAt field')

    const second = await placeOrder(server.baseUrl, player.token)
    assert.equal(second.status, 200, 'a new order must be allowed once the previous one is Cancelled')
  } finally {
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Concurrency matrix (Step 29) — the most important part of this phase.
// ---------------------------------------------------------------------------

test('CONCURRENCY Case 1/6: N simultaneous order creates for the SAME user — exactly one succeeds, database enforces it', async () => {
  const server = await startTestApp()
  const player = await createUser('concurrency-same-user')
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => placeOrder(server.baseUrl, player.token)),
    )
    const succeeded = attempts.filter((r) => r.status === 'fulfilled' && r.value.status === 200)
    const rejected = attempts.filter((r) => r.status === 'fulfilled' && r.value.status === 409)

    assert.equal(succeeded.length, 1, 'exactly one of 5 concurrent creates must succeed')
    assert.equal(rejected.length, 4, 'the other 4 must be rejected with 409')

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1 AND has_active_order_flag = true',
      [player.id],
    )
    assert.equal(rows[0].count, 1, 'exactly one active order exists in the database after the race — never two, never zero')
  } finally {
    await player.cleanup()
    await server.close()
  }
})

test('CONCURRENCY Case 2: simultaneous orders for DIFFERENT users both succeed', async () => {
  const server = await startTestApp()
  const playerA = await createUser('concurrency-diff-a')
  const playerB = await createUser('concurrency-diff-b')
  try {
    const [a, b] = await Promise.all([placeOrder(server.baseUrl, playerA.token), placeOrder(server.baseUrl, playerB.token)])
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.notEqual(a.body.order.id, b.body.order.id)
  } finally {
    await playerA.cleanup()
    await playerB.cleanup()
    await server.close()
  }
})

test('CONCURRENCY Case 3: an order is rejected the instant an active order already exists, verified at the model layer directly', async () => {
  const player = await createUser('concurrency-model-level')
  try {
    await insertOrder({ userId: player.id, canteenId: canteen.id, customerName: player.name, seatId: 'A1', items: sampleItems(), total: 218 })
    await assert.rejects(
      () => insertOrder({ userId: player.id, canteenId: canteen.id, customerName: player.name, seatId: 'A2', items: sampleItems(), total: 218 }),
      (err) => err.code === '23505',
      'the database itself (not application logic) must reject the second active order',
    )
    const active = await findActiveOrderByUserId(player.id, canteen.id)
    assert.ok(active, 'exactly one active order must exist')
  } finally {
    await player.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Database constraint tests (Step 30) — verified directly against Postgres,
// not inferred from application behavior.
// ---------------------------------------------------------------------------

test('DB CONSTRAINT: an invalid status value is rejected by the CHECK constraint directly', async () => {
  const player = await createUser('constraint-status')
  try {
    await assert.rejects(
      () => pool.query(
        `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status) VALUES ('ORD-TESTBAD1', $1, $2, 'x', 'x', 1, 'NotARealStatus')`,
        [player.id, canteen.id],
      ),
      (err) => /orders_status_check/.test(err.message) || err.code === '23514',
    )
  } finally {
    await player.cleanup()
  }
})

test('DB CONSTRAINT: two directly-inserted active rows for the same user AT THE SAME CANTEEN violate the partial unique index', async () => {
  const player = await createUser('constraint-active')
  try {
    await pool.query(
      `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, has_active_order_flag) VALUES ('ORD-TESTACT1', $1, $2, 'x', 'x', 1, 'Pending', true)`,
      [player.id, canteen.id],
    )
    await assert.rejects(
      () => pool.query(
        `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, has_active_order_flag) VALUES ('ORD-TESTACT2', $1, $2, 'x', 'x', 1, 'Pending', true)`,
        [player.id, canteen.id],
      ),
      (err) => err.code === '23505' && /idx_orders_one_active_per_canteen_user/.test(err.message),
    )
  } finally {
    await player.cleanup()
  }
})

test('DB CONSTRAINT: deleting an order cascades to its order_items — no orphans possible', async () => {
  const player = await createUser('constraint-cascade')
  try {
    const order = await insertOrder({ userId: player.id, canteenId: canteen.id, customerName: player.name, seatId: 'A1', items: sampleItems(), total: 218 })
    const before = await pool.query('SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1', [order.id])
    assert.equal(before.rows[0].count, 1)

    await pool.query('DELETE FROM orders WHERE id = $1', [order.id])

    const after = await pool.query('SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1', [order.id])
    assert.equal(after.rows[0].count, 0, 'ON DELETE CASCADE must remove the child rows, never leave orphans')
  } finally {
    await player.cleanup()
  }
})

test('DB CONSTRAINT: a zero or negative quantity is rejected — and the whole order write rolls back (no orphaned order row)', async () => {
  const player = await createUser('constraint-rollback')
  try {
    await assert.rejects(
      () => insertOrder({
        userId: player.id,
        canteenId: canteen.id,
        customerName: player.name,
        seatId: 'A1',
        items: [{ id: '1', foodId: '1', name: 'Pizza', price: 109, qty: 0 }],
        total: 0,
      }),
      (err) => /order_items_quantity_check/.test(err.message),
    )

    const orphanCheck = await pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1', [player.id])
    assert.equal(orphanCheck.rows[0].count, 0, 'the failed item insert must have rolled back the order insert too — no orphaned order with zero items')
  } finally {
    await player.cleanup()
  }
})

test('DB CONSTRAINT: user_id is required — a null user_id is rejected', async () => {
  await assert.rejects(
    () => pool.query(`INSERT INTO orders (public_order_id, user_id, canteen_id, total, status) VALUES ('ORD-TESTNULL', NULL, $1, 1, 'Pending')`, [canteen.id]),
    (err) => /null value in column "user_id"/.test(err.message) || err.code === '23502',
  )
})

test('DB CONSTRAINT: canteen_id is required — a null canteen_id is rejected', async () => {
  const player = await createUser('constraint-canteen-null')
  try {
    await assert.rejects(
      () => pool.query(`INSERT INTO orders (public_order_id, user_id, canteen_id, total, status) VALUES ('ORD-TESTNULL2', $1, NULL, 1, 'Pending')`, [player.id]),
      (err) => /null value in column "canteen_id"/.test(err.message) || err.code === '23502',
    )
  } finally {
    await player.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Order history + historical price/name snapshot integrity (Steps 3, 23)
// ---------------------------------------------------------------------------

test('order history: newest first, includes Completed/Cancelled, and historical prices never track live MenuItem price changes', async () => {
  const server = await startTestApp()
  const player = await createUser('history')
  const staff = await createStaffUser()
  const priceAtOrderTime = 109
  let menuItemOriginalPrice = null
  try {
    // Snapshot + temporarily bump menu_items(id=1)'s live price — proves
    // the historical order_items.unit_price is NEVER re-derived from it.
    const before = await pool.query('SELECT price FROM menu_items WHERE id = 1')
    menuItemOriginalPrice = before.rows[0].price

    const first = await placeOrder(server.baseUrl, player.token, [{ id: '1', foodId: '1', name: 'Pizza', price: priceAtOrderTime, qty: 1 }])
    await fetch(`${server.baseUrl}/canteen/orders/${first.body.order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' }),
    })

    await pool.query('UPDATE menu_items SET price = 999.99 WHERE id = 1')

    const second = await placeOrder(server.baseUrl, player.token, [{ id: '1', foodId: '1', name: 'Pizza', price: priceAtOrderTime, qty: 1 }])
    await fetch(`${server.baseUrl}/canteen/orders/${second.body.order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${staff.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' }),
    })

    const historyRes = await fetch(`${server.baseUrl}/canteen/orders/history/${player.id}`, { headers: { Authorization: `Bearer ${player.token}` } })
    assert.equal(historyRes.status, 200)
    const history = (await historyRes.json()).orders
    assert.equal(history.length, 2)
    assert.equal(history[0].id, second.body.order.id, 'newest order first')
    assert.equal(history[1].id, first.body.order.id)
    assert.equal(history[0].status, 'Completed')
    assert.equal(history[1].status, 'Cancelled', 'cancelled orders remain visible in history')
    // The live menu_items price was bumped to 999.99 AFTER both orders —
    // both must still show the ORIGINAL price they were placed at.
    assert.equal(history[0].items[0].price, priceAtOrderTime)
    assert.equal(history[1].items[0].price, priceAtOrderTime)
  } finally {
    if (menuItemOriginalPrice !== null) await pool.query('UPDATE menu_items SET price = $1 WHERE id = 1', [menuItemOriginalPrice])
    await player.cleanup()
    await staff.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Migration script — idempotency / resumability against the REAL migration
// logic, using disposable Mongo + Postgres fixtures so real order history
// is never touched.
// ---------------------------------------------------------------------------

test('migration script: running twice never creates duplicate orders, correctly reports inserted vs updated, and resolves item ids via BOTH forms', async () => {
  const fixtureUser = await createUser('migration-fixture')
  const fixtureDoc = await OrderMongo.create({
    userId: fixtureUser.id,
    customerName: fixtureUser.name,
    seatId: 'Z9',
    items: [{ id: '1', foodId: '1', name: 'Pizza (Postgres-format id)', price: 109, qty: 1 }],
    total: 109,
    status: 'Order Placed', // legacy status name — must normalize to 'Pending'
    orderedAt: new Date(),
    hasActiveOrderFlag: true,
  })

  try {
    const firstRun = await runOrderMigration()
    const firstRecord = firstRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(firstRecord.status, 'inserted')

    const migratedFirst = (await pool.query('SELECT * FROM orders WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])).rows[0]
    assert.equal(migratedFirst.status, 'Pending', 'legacy status name must be normalized, never stored verbatim')
    assert.equal(migratedFirst.has_active_order_flag, true)

    const migratedItem = (await pool.query('SELECT * FROM order_items WHERE order_id = $1', [migratedFirst.id])).rows[0]
    assert.equal(migratedItem.menu_item_id, 1, 'a Postgres-format raw id must resolve directly')

    const secondRun = await runOrderMigration()
    const secondRecord = secondRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(secondRecord.status, 'updated')
    assert.equal(secondRecord.postgresId, firstRecord.postgresId)

    const orderCount = await pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    assert.equal(orderCount.rows[0].count, 1, 'no duplicate order on the second run')
    const itemCount = await pool.query('SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1', [migratedFirst.id])
    assert.equal(itemCount.rows[0].count, 1, 'no duplicate order_items on the second run')
  } finally {
    await pool.query('DELETE FROM orders WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    await OrderMongo.deleteOne({ _id: fixtureDoc._id })
    await fixtureUser.cleanup()
  }
})

test('migration script: a document missing required fields is skipped, not failed, and does not abort the run', async () => {
  const fixtureDoc = await OrderMongo.collection.insertOne({
    customerName: 'Incomplete',
    // no userId, no total, no items — simulates corrupt/incomplete legacy data
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  try {
    const run = await runOrderMigration()
    const record = run.results.find((r) => r.legacyMongoId === String(fixtureDoc.insertedId))
    assert.equal(record.status, 'skipped')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE legacy_mongo_id = $1', [String(fixtureDoc.insertedId)])
    assert.equal(rows[0].count, 0)
  } finally {
    await OrderMongo.collection.deleteOne({ _id: fixtureDoc.insertedId })
  }
})

test('migration script: an unrecognized status is a hard FAILURE, never silently coerced', async () => {
  const fixtureUser = await createUser('migration-bad-status')
  const fixtureDoc = await OrderMongo.create({
    userId: fixtureUser.id,
    customerName: fixtureUser.name,
    seatId: 'A1',
    items: [{ id: '1', foodId: '1', name: 'Pizza', price: 109, qty: 1 }],
    total: 109,
    status: 'SomeStatusThatHasNeverExisted',
  })

  try {
    const run = await runOrderMigration()
    const record = run.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(record.status, 'FAILED')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    assert.equal(rows[0].count, 0)
  } finally {
    await OrderMongo.deleteOne({ _id: fixtureDoc._id })
    await fixtureUser.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Real production data integrity — the 2 real historical orders must be
// completely unaffected by this entire test file.
// ---------------------------------------------------------------------------

test('the 2 real pre-existing orders (user_id 12) are untouched by this test file', async () => {
  const { rows } = await pool.query('SELECT id, status, total FROM orders WHERE user_id = 12 ORDER BY id')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, 'Completed')
  assert.equal(Number(rows[0].total), 419)
  assert.equal(rows[1].status, 'Completed')
  assert.equal(Number(rows[1].total), 264)
})

test.after(async () => {
  await mongoose.connection.close()
})
