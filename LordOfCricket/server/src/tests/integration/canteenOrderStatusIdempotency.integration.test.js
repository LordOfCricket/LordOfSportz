// Phase 21.4 — Idempotency/duplicate-action audit. Before this fix,
// canteenOrder.model.js#updateOrderStatusByPublicId had no guard against
// re-applying the SAME status: a staff double-click (or a retried request
// after a slow/lost response) re-stamped completed_at, re-emitted the
// order-status-updated/order-completed Socket.IO events, and created a
// SECOND CANTEEN_ORDER_STATUS_CHANGED Ground-Owner notification for the
// same logical transition. This file verifies the fix — a same-status
// repeat is now a true no-op — without weakening the genuine-transition or
// tenancy-isolation behavior it sits next to.
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
  const emitted = []
  app.locals.io = {
    emit: () => {},
    to: (rooms) => ({
      emit: (event, payload) => emitted.push({ rooms, event, payload }),
    }),
  }
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    emitted,
    async close() {
      await new Promise((r) => httpServer.close(r))
    },
  }
}

const uniqueTag = () => Math.random().toString(36).slice(2, 10)

async function createUser(label) {
  const tag = uniqueTag()
  const user = (
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`, [
      `Integration Test ${label}`,
      `status-idem-${label}-${tag}@example.test`,
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

async function createOwnedGround(userId, label) {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,'ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `status-idem-ground-${tag}`, label, 'Test ground'],
  )
  await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_OWNER',true)`, [userId, ground.id])
  return ground
}

async function createCanteen(groundId) {
  const tag = uniqueTag()
  const { rows: [canteen] } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active) VALUES ($1,$2,'Canteen',true) RETURNING *`,
    [groundId, `CAN-${tag}`],
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

async function cleanupGround(groundId) {
  await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))', [groundId])
  await pool.query('DELETE FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_notifications WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

// `orderId` here is the PUBLIC order id (order.id in every JSON response,
// e.g. "ORD-XXXX") — ground_notifications.related_order_id is the internal
// numeric FK, so this joins through orders.public_order_id rather than
// requiring every call site to know the internal id.
async function countStatusChangeNotifications(orderId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ground_notifications gn
     JOIN orders o ON o.id = gn.related_order_id
     WHERE gn.type = 'CANTEEN_ORDER_STATUS_CHANGED' AND o.public_order_id = $1`,
    [orderId],
  )
  return rows[0].count
}

async function setupOrder(server) {
  const owner = await elevate(await createUser('owner'))
  const customer = await elevate(await createUser('customer'))
  const ground = await createOwnedGround(owner.id, 'Status Idem Ground')
  const canteen = await createCanteen(ground.id)
  const item = await createMenuItem(canteen.id)

  const createRes = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`, {
    method: 'POST',
    headers: cauth(customer),
    body: JSON.stringify({ seatId: 'A1', items: [{ id: item.id, qty: 1 }] }),
  })
  const { order } = await createRes.json()
  assert.ok(order?.id, 'fixture order must be created successfully')

  async function patchStatus(publicOrderId, status) {
    return fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders/${publicOrderId}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ status }),
    })
  }

  return {
    owner,
    customer,
    ground,
    canteen,
    order,
    patchStatus,
    async cleanup() {
      await cleanupGround(ground.id)
      await owner.cleanup()
      await customer.cleanup()
    },
  }
}

test('repeating the SAME status transition is idempotent: 200, not 404, order unchanged', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    const first = await fx.patchStatus(fx.order.id, 'Accepted')
    assert.strictEqual(first.status, 200)
    const firstBody = await first.json()
    assert.strictEqual(firstBody.order.status, 'Accepted')

    const second = await fx.patchStatus(fx.order.id, 'Accepted')
    assert.strictEqual(second.status, 200, 'a repeat same-status PATCH must be an idempotent 200, not a 404')
    const secondBody = await second.json()
    assert.strictEqual(secondBody.order.status, 'Accepted')
    assert.strictEqual(secondBody.order.id, fx.order.id)
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('repeating the same status transition does NOT create a second Ground-Owner notification', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    await fx.patchStatus(fx.order.id, 'Accepted')
    const afterFirst = await countStatusChangeNotifications(fx.order.id)
    assert.strictEqual(afterFirst, 1)

    // Simulate a double-click / retried request — same target status again.
    await fx.patchStatus(fx.order.id, 'Accepted')
    await fx.patchStatus(fx.order.id, 'Accepted')
    const afterRepeats = await countStatusChangeNotifications(fx.order.id)
    assert.strictEqual(afterRepeats, 1, 'repeat clicks on the same status must not create additional notifications')
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('repeating the same status transition does NOT re-emit order-status-updated over the socket', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    await fx.patchStatus(fx.order.id, 'Accepted')
    const emitsAfterFirst = server.emitted.filter((e) => e.event === 'order-status-updated' || e.event === 'order.status.updated').length

    await fx.patchStatus(fx.order.id, 'Accepted')
    const emitsAfterRepeat = server.emitted.filter((e) => e.event === 'order-status-updated' || e.event === 'order.status.updated').length

    assert.strictEqual(emitsAfterRepeat, emitsAfterFirst, 'a no-op repeat transition must not emit a second socket update')
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('repeating a terminal (Completed) transition does not reset completed_at', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    const first = await fx.patchStatus(fx.order.id, 'Completed')
    const firstBody = await first.json()
    const firstCompletedAt = firstBody.order.completedAt
    assert.ok(firstCompletedAt, 'completedAt must be stamped on the real transition')

    await new Promise((resolve) => setTimeout(resolve, 20))

    const second = await fx.patchStatus(fx.order.id, 'Completed')
    assert.strictEqual(second.status, 200)
    const secondBody = await second.json()
    assert.strictEqual(secondBody.order.completedAt, firstCompletedAt, 'a repeat Completed PATCH must not re-stamp completed_at')

    const notifCount = await countStatusChangeNotifications(fx.order.id)
    assert.strictEqual(notifCount, 1)
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('a genuinely different transition still updates normally and still notifies once per real change', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    const toAccepted = await fx.patchStatus(fx.order.id, 'Accepted')
    assert.strictEqual((await toAccepted.json()).order.status, 'Accepted')

    const toPreparing = await fx.patchStatus(fx.order.id, 'Preparing')
    assert.strictEqual(toPreparing.status, 200)
    assert.strictEqual((await toPreparing.json()).order.status, 'Preparing')

    const notifCount = await countStatusChangeNotifications(fx.order.id)
    assert.strictEqual(notifCount, 2, 'two genuinely different transitions must produce two notifications')
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('regression: a genuinely unknown order id still 404s (idempotency fix must not mask real not-found)', async () => {
  const server = await startTestApp()
  const fx = await setupOrder(server)
  try {
    const res = await fx.patchStatus('ORD-DOES-NOT-EXIST-00000000', 'Accepted')
    assert.strictEqual(res.status, 404)
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('regression: an order id from a DIFFERENT canteen still 404s (tenancy isolation unaffected by the fix)', async () => {
  const server = await startTestApp()
  const fxA = await setupOrder(server)
  const fxB = await setupOrder(server)
  try {
    const res = await fetch(
      `${server.baseUrl}/grounds/${fxA.ground.public_ground_id}/canteens/${fxA.canteen.public_canteen_id}/orders/${fxB.order.id}/status`,
      {
        method: 'PATCH',
        headers: cauth(fxA.owner),
        body: JSON.stringify({ status: 'Accepted' }),
      },
    )
    assert.strictEqual(res.status, 404, 'an order id belonging to a different canteen must never be reachable, idempotent-no-op or otherwise')
  } finally {
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})
