// Phase 14 Part 2 — canteen "one active order per user" concurrency guard.
// Proved directly against the real MongoDB unique partial index
// (userId + hasActiveOrderFlag), the actual source of correctness — not the
// findOne-then-create fast path the retired controller used, which two
// near-simultaneous requests could both pass. Skips cleanly (not fail) if
// MongoDB isn't configured, consistent with the rest of this app treating
// Mongo as optional.
//
// MongoDB cleanup, Phase 5: the LIVE Order implementation is now
// PostgreSQL-backed (see canteenOrder.model.js and the equivalent
// concurrency proof in canteenOrder.integration.test.js's "CONCURRENCY"
// tests). This file's import was repointed to the renamed legacy Mongoose
// model (canteenOrderMongoLegacy.model.js) — it still legitimately proves
// the retired MongoDB model's own index still works, which matters only as
// a rollback-path regression check, not as coverage of the live app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectMongo, isMongoReady } from '../../config/db.js'
import Order from '../../models/canteenOrderMongoLegacy.model.js'

await connectMongo()
const mongoReady = isMongoReady()
if (mongoReady) {
  // Model index creation is async/background by default — make sure the
  // partial unique index actually exists before any test relies on it.
  await Order.init()
}

const TEST_USER_ID = 987654321

async function cleanup() {
  await Order.deleteMany({ userId: TEST_USER_ID })
}

test('canteen concurrency: two simultaneous active-order creates for the same user — exactly one succeeds', { skip: !mongoReady && 'MongoDB not configured/reachable' }, async () => {
  await cleanup()
  try {
    const attempt = () => Order.create({ userId: TEST_USER_ID, customerName: 'Concurrency Test', seatId: 'A1', items: [{ id: 'x', name: 'Item', price: 10, qty: 1 }], total: 10, status: 'Pending', orderedAt: new Date(), hasActiveOrderFlag: true })

    const [a, b] = await Promise.allSettled([attempt(), attempt()])
    const results = [a, b]
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'exactly one of the two concurrent creates must succeed')
    assert.equal(rejected.length, 1, 'exactly one of the two concurrent creates must fail')
    assert.equal(rejected[0].reason.code, 11000, 'the losing request must fail with a MongoDB duplicate-key error, not something else')

    const activeCount = await Order.countDocuments({ userId: TEST_USER_ID, hasActiveOrderFlag: true })
    assert.equal(activeCount, 1, 'exactly one active order exists in the database after the race — never two')
  } finally {
    await cleanup()
  }
})

test('canteen concurrency: after the active order is marked terminal (flag unset), a new active order can be created', { skip: !mongoReady && 'MongoDB not configured/reachable' }, async () => {
  await cleanup()
  try {
    const first = await Order.create({ userId: TEST_USER_ID, customerName: 'Concurrency Test', seatId: 'A1', items: [{ id: 'x', name: 'Item', price: 10, qty: 1 }], total: 10, status: 'Pending', orderedAt: new Date(), hasActiveOrderFlag: true })

    // Exactly what updateOrderStatus() does when the order reaches a terminal status.
    await Order.updateOne({ _id: first._id }, { $unset: { hasActiveOrderFlag: 1 } })

    const second = await Order.create({ userId: TEST_USER_ID, customerName: 'Concurrency Test', seatId: 'A2', items: [{ id: 'y', name: 'Item2', price: 20, qty: 1 }], total: 20, status: 'Pending', orderedAt: new Date(), hasActiveOrderFlag: true })
    assert.ok(second._id, 'a second active order is allowed once the first is no longer active')

    const activeCount = await Order.countDocuments({ userId: TEST_USER_ID, hasActiveOrderFlag: true })
    assert.equal(activeCount, 1)
  } finally {
    await cleanup()
  }
})

test.after(async () => {
  if (mongoReady) await mongoose.connection.close()
})
