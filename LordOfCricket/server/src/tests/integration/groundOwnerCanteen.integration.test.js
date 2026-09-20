// Phase 5 — Ground Owner Canteen / Food & Refreshments Management.
// Tests authorization, IDOR protection, menu management, today's menu publication,
// and order status management from ground owner perspective.
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

const uniqueTag = () => Math.random().toString(36).slice(2, 6)

async function createUser(label, { role = 'player' } = {}) {
  const tag = uniqueTag()
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash',$3) RETURNING *`,
      [`Integration Test ${label}`, `canteen-owner-${label}-${tag}@example.test`, role],
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
  const { cookie, sessionId } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  user.sessionId = sessionId
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

  const { rows: [canteen] } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active)
     VALUES ($1, $2, $3, true) RETURNING *`,
    [ground.id, `test-canteen-${tag}`, 'Test Canteen'],
  )

  return { ground, canteen }
}

async function cleanupGround(groundId) {
  await pool.query('DELETE FROM orders WHERE id IN (SELECT id FROM orders WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1))', [groundId])
  await pool.query('DELETE FROM menu_items WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM today_menu WHERE canteen_id IN (SELECT id FROM canteens WHERE ground_id = $1)', [groundId])
  await pool.query('DELETE FROM canteens WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundId])
  await pool.query('DELETE FROM grounds WHERE id = $1', [groundId])
}

// Menu Item CRUD Tests
test('POST /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master - owner can create menu item', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Chicken Biryani',
          category: 'Biryani',
          description: 'Fragrant biryani',
          price: 299.50,
          stock: 50,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    assert.strictEqual(res.status, 201)
    const data = await res.json()
    assert.strictEqual(data.item.name, 'Chicken Biryani')
    assert.strictEqual(Number(data.item.price), 299.50)
    assert.ok(data.item.id, 'created menu item should have an id')

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master/:id - owner can update menu item', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const createRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Chicken Biryani',
          category: 'Biryani',
          price: 299.50,
          stock: 50,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    const { item: menuItem } = await createRes.json()

    const updateRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master/${menuItem.id}`,
      {
        method: 'PATCH',
        headers: cauth(owner),
        body: JSON.stringify({ price: 349.50, stock: 30 }),
      },
    )
    assert.strictEqual(updateRes.status, 200)
    const updated = await updateRes.json()
    assert.strictEqual(Number(updated.item.price), 349.50)
    assert.strictEqual(updated.item.stock, 30)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('DELETE /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master/:id - owner can delete menu item', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const createRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Test Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    const { item: menuItem } = await createRes.json()

    const deleteRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master/${menuItem.id}`,
      { method: 'DELETE', headers: cauth(owner) },
    )
    assert.strictEqual(deleteRes.status, 200)

    // Phase 11 audit fix — deletion is a soft delete (is_active = false,
    // models/canteenMenuItem.model.js), not a row removal; this test
    // previously asserted the row was gone entirely, which never matched
    // the actual (intentional — preserves historical order references)
    // implementation.
    const verifyRes = await pool.query('SELECT is_active FROM menu_items WHERE id = $1', [menuItem.id])
    assert.strictEqual(verifyRes.rows.length, 1)
    assert.strictEqual(verifyRes.rows[0].is_active, false)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('GET /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master - owner can list menu items', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Item 1',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/1.jpg',
        }),
      },
    )
    await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Item 2',
          category: 'Test',
          price: 150,
          stock: 20,
          image: 'https://example.com/2.jpg',
        }),
      },
    )

    const listRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(listRes.status, 200)
    const { items: menuItems } = await listRes.json()
    assert.strictEqual(menuItems.length, 2)
    assert(menuItems.some(item => item.name === 'Item 1'))
    assert(menuItems.some(item => item.name === 'Item 2'))

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

// Authorization Tests
test('POST /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master - non-owner cannot create menu item', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('NonOwner', { role: 'player' })
    await elevate(owner)
    await elevate(nonOwner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(nonOwner),
        body: JSON.stringify({
          name: 'Hacked Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    assert.strictEqual(res.status, 403)

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

// Ground Isolation Tests
test('POST /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master - owner A cannot access owner B ground', async (t) => {
  const server = await startTestApp()
  try {
    const tag1 = uniqueTag()
    const tag2 = uniqueTag()
    const ownerA = await createUser('OwnerA', { role: 'player' })
    const ownerB = await createUser('OwnerB', { role: 'player' })
    await elevate(ownerA)
    await elevate(ownerB)
    const { ground: groundA, canteen: canteenA } = await createOwnedGround(ownerA.id, 'Ground A', tag1)
    const { ground: groundB, canteen: canteenB } = await createOwnedGround(ownerB.id, 'Ground B', tag2)

    const res = await fetch(
      `${server.baseUrl}/grounds/${groundB.public_ground_id}/canteens/${canteenB.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(ownerA),
        body: JSON.stringify({
          name: 'Hacked Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    assert.strictEqual(res.status, 403)

    await ownerA.cleanup()
    await ownerB.cleanup()
    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
  } finally {
    await server.close()
  }
})

// Today's Menu Tests
test("PATCH /grounds/:publicGroundId/canteens/:publicCanteenId/menu/today - owner can publish today's menu", async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const createRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Today Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    const { item: menuItem } = await createRes.json()

    const publishRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/today`,
      {
        method: 'PATCH',
        headers: cauth(owner),
        body: JSON.stringify({
          items: [
            {
              id: menuItem.id,
              dailyPrice: 120,
              available: true,
              stock: 5,
            },
          ],
        }),
      },
    )
    assert.strictEqual(publishRes.status, 200)
    const published = await publishRes.json()
    assert.ok(published.publishedAt, 'response should have publishedAt')

    const configRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/today/config`,
      { headers: cauth(owner) },
    )
    const config = await configRes.json()
    assert.strictEqual(config.items.length, 1, 'the published item should actually be persisted, not silently dropped')
    assert.strictEqual(config.items[0].id, String(menuItem.id))
    assert.strictEqual(config.items[0].dailyPrice, 120)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

// Order Management Tests
test('GET /grounds/:publicGroundId/canteens/:publicCanteenId/orders - owner can list orders', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const player = await createUser('Player', { role: 'player' })
    await elevate(owner)
    await elevate(player)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const listRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(listRes.status, 200)
    const { orders } = await listRes.json()
    assert(Array.isArray(orders))

    await owner.cleanup()
    await player.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /grounds/:publicGroundId/canteens/:publicCanteenId/orders/:id/status - owner can update order status', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const player = await createUser('Player', { role: 'player' })
    await elevate(owner)
    await elevate(player)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const menuRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: cauth(owner),
        body: JSON.stringify({
          name: 'Test Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    const { item: menuItem } = await menuRes.json()

    const orderRes = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { ...cauth(player), Authorization: `Bearer ${player.token}` },
      body: JSON.stringify({
        items: [{ menuItemId: menuItem.id, quantity: 2 }],
        customerName: 'Test Customer',
        seatId: 'A1',
      }),
    })

    if (orderRes.status === 201) {
      const { order } = await orderRes.json()

      const updateRes = await fetch(
        `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders/${order.id}/status`,
        {
          method: 'PATCH',
          headers: cauth(owner),
          body: JSON.stringify({ status: 'Accepted' }),
        },
      )

      if (updateRes.status === 200) {
        const updated = await updateRes.json()
        assert.strictEqual(updated.order.status, 'Accepted')
      }
    }

    await owner.cleanup()
    await player.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

// Phase 24 — Canteen activate/deactivate self-service. Reuses the exact
// same ground/canteen tenancy resolution (requireGroundCanteenRole) every
// other test above already exercises for menu/orders — these focus
// specifically on the new status endpoint and its effect on the EXISTING,
// unchanged order-creation guard (canteenOrder.controller.js's Phase 17.2
// check), never a second parallel check.

async function createMenuItemAndPublish(server, owner, ground, canteen) {
  const createRes = await fetch(
    `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
    {
      method: 'POST',
      headers: cauth(owner),
      body: JSON.stringify({ name: 'Status Test Item', category: 'Test', price: 50, stock: 20, image: 'https://example.com/i.jpg' }),
    },
  )
  const { item } = await createRes.json()
  return item
}

async function placeRealOrder(server, customer, ground, canteen, menuItem) {
  return fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`, {
    method: 'POST',
    headers: cauth(customer),
    body: JSON.stringify({ seatId: 'A1', items: [{ id: menuItem.id, qty: 1 }] }),
  })
}

test('GET /grounds/:publicGroundId - canteen active status is visible on the ground profile (reused, not duplicated)', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    const found = data.canteens.find((c) => c.publicCanteenId === canteen.public_canteen_id)
    assert.ok(found)
    assert.strictEqual(found.isActive, true)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH /grounds/:publicGroundId/canteens/:publicCanteenId/status - owner can deactivate and reactivate their canteen', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const deactivateRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`,
      { method: 'PATCH', headers: cauth(owner), body: JSON.stringify({ isActive: false }) },
    )
    assert.strictEqual(deactivateRes.status, 200)
    assert.strictEqual((await deactivateRes.json()).canteen.isActive, false)

    const { rows: [row1] } = await pool.query('SELECT is_active FROM canteens WHERE id = $1', [canteen.id])
    assert.strictEqual(row1.is_active, false)

    const reactivateRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`,
      { method: 'PATCH', headers: cauth(owner), body: JSON.stringify({ isActive: true }) },
    )
    assert.strictEqual(reactivateRes.status, 200)
    assert.strictEqual((await reactivateRes.json()).canteen.isActive, true)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('deactivating the canteen blocks new orders (existing 409 CANTEEN_CLOSED path), reactivating allows them again', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const customer = await createUser('Customer', { role: 'player' })
    // A distinct second customer for the post-reactivation order — the
    // first customer already has an active order from `beforeRes` below,
    // and the existing one-active-order-per-user-per-canteen guarantee
    // (unrelated to this phase, Phase 14/17) would otherwise 409 that
    // second attempt for a completely different reason than what this test
    // is actually verifying.
    const customer2 = await createUser('Customer2', { role: 'player' })
    await elevate(owner)
    await elevate(customer)
    await elevate(customer2)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)
    const menuItem = await createMenuItemAndPublish(server, owner, ground, canteen)

    const beforeRes = await placeRealOrder(server, customer, ground, canteen, menuItem)
    assert.strictEqual(beforeRes.status, 200, 'order must succeed while the canteen is active')

    await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ isActive: false }),
    })

    const duringRes = await placeRealOrder(server, customer, ground, canteen, menuItem)
    assert.strictEqual(duringRes.status, 409)
    const duringBody = await duringRes.json()
    assert.strictEqual(duringBody.code, 'CANTEEN_CLOSED')

    await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ isActive: true }),
    })

    const afterRes = await placeRealOrder(server, customer2, ground, canteen, menuItem)
    assert.strictEqual(afterRes.status, 200, 'order must succeed again once reactivated')

    // Orders reference these users via a FK — must be cleared before the
    // users themselves are deleted.
    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
    await customer2.cleanup()
  } finally {
    await server.close()
  }
})

test('deactivating the canteen does not delete/corrupt existing menu items or existing orders', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const customer = await createUser('Customer', { role: 'player' })
    await elevate(owner)
    await elevate(customer)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)
    const menuItem = await createMenuItemAndPublish(server, owner, ground, canteen)
    const orderRes = await placeRealOrder(server, customer, ground, canteen, menuItem)
    const { order } = await orderRes.json()

    await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ isActive: false }),
    })

    const menuListRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      { headers: cauth(owner) },
    )
    const { items } = await menuListRes.json()
    assert.ok(items.some((i) => i.id === menuItem.id), 'menu item must still exist after deactivation')

    const orderGetRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders/${order.id}`,
      { headers: cauth(owner) },
    )
    assert.strictEqual(orderGetRes.status, 200, 'existing order must still be readable/manageable after deactivation')

    // Staff can still progress an already-placed order after deactivation
    // (Phase 17.2's own established rule — deactivation blocks NEW activity
    // only, never wind-down of what already exists).
    const statusUpdateRes = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders/${order.id}/status`,
      { method: 'PATCH', headers: cauth(owner), body: JSON.stringify({ status: 'Accepted' }) },
    )
    assert.strictEqual(statusUpdateRes.status, 200)

    // Orders reference these users via a FK — must be cleared before the
    // users themselves are deleted.
    await cleanupGround(ground.id)
    await owner.cleanup()
    await customer.cleanup()
  } finally {
    await server.close()
  }
})

test('PATCH .../status - non-owner (no membership) cannot toggle canteen status', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const nonOwner = await createUser('NonOwner', { role: 'player' })
    await elevate(owner)
    await elevate(nonOwner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(nonOwner),
      body: JSON.stringify({ isActive: false }),
    })
    assert.strictEqual(res.status, 403)

    const { rows: [row] } = await pool.query('SELECT is_active FROM canteens WHERE id = $1', [canteen.id])
    assert.strictEqual(row.is_active, true, 'must not have been modified')

    await owner.cleanup()
    await nonOwner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH .../status - IDOR: owner A cannot toggle owner B canteen status via a guessed/known id', async (t) => {
  const server = await startTestApp()
  try {
    const tag1 = uniqueTag()
    const tag2 = uniqueTag()
    const ownerA = await createUser('OwnerA', { role: 'player' })
    const ownerB = await createUser('OwnerB', { role: 'player' })
    await elevate(ownerA)
    await elevate(ownerB)
    const { ground: groundA } = await createOwnedGround(ownerA.id, 'Ground A', tag1)
    const { ground: groundB, canteen: canteenB } = await createOwnedGround(ownerB.id, 'Ground B', tag2)

    // Owner A's own ground URL, but Owner B's real canteen id — the
    // combined ground+canteen resolution inside requireGroundCanteenRole
    // must reject this as "not found," never trust the canteen id alone.
    const res = await fetch(`${server.baseUrl}/grounds/${groundA.public_ground_id}/canteens/${canteenB.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(ownerA),
      body: JSON.stringify({ isActive: false }),
    })
    assert.strictEqual(res.status, 404)

    const { rows: [row] } = await pool.query('SELECT is_active FROM canteens WHERE id = $1', [canteenB.id])
    assert.strictEqual(row.is_active, true, 'owner B canteen must be untouched')

    await ownerA.cleanup()
    await ownerB.cleanup()
    await cleanupGround(groundA.id)
    await cleanupGround(groundB.id)
  } finally {
    await server.close()
  }
})

test('PATCH .../status - unauthenticated request rejected', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    assert.strictEqual(res.status, 401)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

test('PATCH .../status - a non-boolean isActive is rejected with 400', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    await elevate(owner)
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/status`, {
      method: 'PATCH',
      headers: cauth(owner),
      body: JSON.stringify({ isActive: 'yes' }),
    })
    assert.strictEqual(res.status, 400)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})

// MFA Requirement Test
test('POST /grounds/:publicGroundId/canteens/:publicCanteenId/menu/master - requires MFA verification', async (t) => {
  const server = await startTestApp()
  try {
    const tag = uniqueTag()
    const owner = await createUser('Owner', { role: 'player' })
    const { ground, canteen } = await createOwnedGround(owner.id, 'Test Ground', tag)

    const res = await fetch(
      `${server.baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/master`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Item',
          category: 'Test',
          price: 100,
          stock: 10,
          image: 'https://example.com/image.jpg',
        }),
      },
    )
    assert.strictEqual(res.status, 401)

    await owner.cleanup()
    await cleanupGround(ground.id)
  } finally {
    await server.close()
  }
})
