// Phase 10 — canteen data tenancy. menu_items/today_menu/orders now carry a
// real canteen_id (schema.sql). This file proves the actual isolation
// invariants (Steps 18-23) against real Postgres.
//
// A structural note on HOW these tests are built: the LIVE HTTP routes
// (/api/canteen/menu, /api/canteen/orders) resolve "the" canteen via
// attachCurrentCanteen/requireCanteenStaffAccess -> findSingleCanteen()
// (Step 24 — deliberately single-canteen-resolving this phase, see the
// Phase 10 report). That means a second real HTTP request can never reach
// a "Canteen B" through these routes — there is exactly one canteen findable
// via HTTP right now. So:
//   - DATA isolation (Section A/B/C/D) is proven at the MODEL layer, calling
//     canteenMenuItem/canteenTodayMenu/canteenOrder model functions with two
//     independent, disposable canteen fixtures directly — this is where the
//     real tenancy boundary (WHERE canteen_id = $N) actually lives.
//   - AUTHORIZATION isolation for ground_users membership vs a DIFFERENT
//     ground (Section E) already has dedicated coverage in Phase 9's
//     groundMembership.integration.test.js (requireCanteenRole's own cross-
//     canteen ALLOW/DENY matrix) — not duplicated here. This file instead
//     proves the Phase 10-specific integration point: requireCanteenStaffAccess's
//     OR-composition (legacy staff vs real ground_users membership) against
//     the REAL wired routes and the REAL single canteen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { findSingleCanteen } from '../../models/canteen.model.js'
import {
  insertMenuItem,
  findActiveMenuItemsByCanteenId,
  findAllMenuItemsByCanteenId,
  updateMenuItemById,
  deactivateMenuItemById,
} from '../../models/canteenMenuItem.model.js'
import { getTodayMenu, replaceTodayMenu } from '../../models/canteenTodayMenu.model.js'

// Phase 3A-established discipline (see canteenMenu.integration.test.js):
// PATCH /canteen/menu/today REPLACES the entire published set — any test
// that publishes to "the" real canteen's TodayMenu must snapshot first and
// restore byte-for-byte after, or it destroys real shared dev data.
async function snapshotRealTodayMenu() {
  const today = await getTodayMenu(realCanteen.id)
  if (!today) return null
  return {
    publishedAt: today.published_at,
    items: today.items.map((row) => ({ id: String(row.menu_item_id), available: row.available, stock: row.stock, dailyPrice: Number(row.daily_price) })),
  }
}

async function restoreRealTodayMenu(snapshot) {
  await replaceTodayMenu({
    canteenId: realCanteen.id,
    publishedAt: snapshot ? snapshot.publishedAt : new Date().toISOString(),
    items: snapshot ? snapshot.items : [],
  })
}
import {
  insertOrder,
  findActiveOrderByUserId,
  findOrderById,
  findOrderHistoryByUserId,
  updateOrderStatusByPublicId,
} from '../../models/canteenOrder.model.js'
import { createMembership } from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

const realCanteen = await findSingleCanteen()
const realGround = (await pool.query('SELECT * FROM grounds WHERE id = $1', [realCanteen.ground_id])).rows[0]

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

async function createGroundCanteenFixture(label) {
  const ground = (
    await pool.query(
      `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`,
      [generatePublicId('GRD', 8), `integration-test-tenancy-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`],
    )
  ).rows[0]
  const canteen = (
    await pool.query(`INSERT INTO canteens (ground_id, public_canteen_id, name) VALUES ($1,$2,$3) RETURNING *`, [
      ground.id,
      generatePublicId('CAN', 8),
      `Integration Test Canteen ${label}`,
    ])
  ).rows[0]
  return {
    ground,
    canteen,
    // menu_items/today_menu/orders -> canteens is deliberately NOT
    // ON DELETE CASCADE (schema.sql: business data must never be silently
    // erased just because a canteen row goes away, same principle as
    // Phase 9's ground_users FKs) — so, unlike deleting a ground (which DOES
    // cascade to canteens/ground_users), any test data referencing this
    // fixture's canteen must be deleted explicitly, in FK-safe order,
    // before the ground itself can be removed.
    async cleanup() {
      await pool.query('DELETE FROM orders WHERE canteen_id = $1', [canteen.id]) // cascades order_items
      await pool.query('DELETE FROM today_menu WHERE canteen_id = $1', [canteen.id]) // cascades today_menu_items
      await pool.query('DELETE FROM menu_items WHERE canteen_id = $1', [canteen.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id]) // cascades canteen, ground_users
    },
  }
}

async function createUser(label, { role = 'player' } = {}) {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING *`,
      [`Integration Test ${label}`, `integration-test-tenancy-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role],
    )
  ).rows[0]
  return {
    id: user.id,
    name: user.name,
    token: signToken({ id: user.id }),
    // orders.user_id -> users is also NO ACTION (unchanged pre-existing
    // schema) — matches canteenOrder.integration.test.js's own createUser
    // cleanup exactly: this user's orders must go before the user row does.
    async cleanup() {
      await pool.query('DELETE FROM orders WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function sampleItems(idOverride = '1') {
  return [{ id: idOverride, foodId: idOverride, name: 'Pizza', price: 100, qty: 1 }]
}

// ---------------------------------------------------------------------------
// Section A — MenuItem data isolation (Invariant 1, Step 20 read/write paths)
// ---------------------------------------------------------------------------

test('menu_items: Canteen A queries never return Canteen B items, and cannot update/deactivate them', async () => {
  const fxA = await createGroundCanteenFixture('menu-a')
  const fxB = await createGroundCanteenFixture('menu-b')
  try {
    const itemA = await insertMenuItem({ canteenId: fxA.canteen.id, name: 'A Special', category: 'Snacks', price: 10 })
    const itemB = await insertMenuItem({ canteenId: fxB.canteen.id, name: 'B Special', category: 'Snacks', price: 20 })

    const activeA = await findActiveMenuItemsByCanteenId(fxA.canteen.id)
    assert.ok(activeA.some((i) => i.id === itemA.id))
    assert.ok(!activeA.some((i) => i.id === itemB.id), 'Canteen A read must never include Canteen B items')

    const allA = await findAllMenuItemsByCanteenId(fxA.canteen.id)
    assert.ok(!allA.some((i) => i.id === itemB.id))

    // Write-path ownership: A's canteenId can't touch B's item id.
    const updateAttempt = await updateMenuItemById(itemB.id, fxA.canteen.id, { price: 999 })
    assert.equal(updateAttempt, null, 'updating Canteen B item while scoped to Canteen A must affect zero rows')
    const deactivateAttempt = await deactivateMenuItemById(itemB.id, fxA.canteen.id)
    assert.equal(deactivateAttempt, null, 'deactivating Canteen B item while scoped to Canteen A must affect zero rows')

    const bStillIntact = await findActiveMenuItemsByCanteenId(fxB.canteen.id)
    assert.ok(bStillIntact.some((i) => i.id === itemB.id && Number(i.price) === 20), 'Canteen B item must be completely unaffected')
  } finally {
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Section B — TodayMenu ownership validation (Step 15, Invariant 2/3)
// ---------------------------------------------------------------------------

test('today_menu: publishing Canteen A cannot reference a Canteen B menu item — silently dropped, exactly like an unresolvable id', async () => {
  const fxA = await createGroundCanteenFixture('today-a')
  const fxB = await createGroundCanteenFixture('today-b')
  try {
    const itemA = await insertMenuItem({ canteenId: fxA.canteen.id, name: 'A Item', category: 'Snacks', price: 10 })
    const itemB = await insertMenuItem({ canteenId: fxB.canteen.id, name: 'B Item', category: 'Snacks', price: 20 })

    await replaceTodayMenu({
      canteenId: fxA.canteen.id,
      publishedAt: new Date().toISOString(),
      items: [
        { id: String(itemA.id), available: true, stock: 5, dailyPrice: 10 },
        { id: String(itemB.id), available: true, stock: 5, dailyPrice: 20 }, // cross-canteen — must be dropped
      ],
    })

    const todayA = await getTodayMenu(fxA.canteen.id)
    assert.equal(todayA.items.length, 1, 'only the same-canteen item may be published')
    assert.equal(todayA.items[0].menu_item_id, itemA.id)
    assert.ok(
      !todayA.items.some((i) => i.menu_item_id === itemB.id),
      'Invariant 3: every TodayMenu entry must belong to the same canteen as the TodayMenu row',
    )

    // Canteen B's own TodayMenu is untouched by A's publish.
    const todayB = await getTodayMenu(fxB.canteen.id)
    assert.equal(todayB, null, 'Canteen B never published anything of its own')
  } finally {
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

test('today_menu: UNIQUE(canteen_id) — each canteen gets its own independent "today" row', async () => {
  const fxA = await createGroundCanteenFixture('today-unique-a')
  const fxB = await createGroundCanteenFixture('today-unique-b')
  try {
    const itemA = await insertMenuItem({ canteenId: fxA.canteen.id, name: 'A Item', category: 'Snacks', price: 10 })
    const itemB = await insertMenuItem({ canteenId: fxB.canteen.id, name: 'B Item', category: 'Snacks', price: 20 })

    await replaceTodayMenu({ canteenId: fxA.canteen.id, publishedAt: new Date().toISOString(), items: [{ id: String(itemA.id), available: true, stock: 1, dailyPrice: 10 }] })
    await replaceTodayMenu({ canteenId: fxB.canteen.id, publishedAt: new Date().toISOString(), items: [{ id: String(itemB.id), available: true, stock: 1, dailyPrice: 20 }] })

    const todayA = await getTodayMenu(fxA.canteen.id)
    const todayB = await getTodayMenu(fxB.canteen.id)
    assert.notEqual(todayA.id, todayB.id, 'each canteen must have its own today_menu row, not share one')
    assert.equal(todayA.items[0].menu_item_id, itemA.id)
    assert.equal(todayB.items[0].menu_item_id, itemB.id)
  } finally {
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Section C — Order data isolation + ownership (Invariant 4/6, Steps 20/21/26)
// ---------------------------------------------------------------------------

test('orders: same user/mobile can hold ONE active order in Canteen A AND a separate active order in Canteen B simultaneously (Step 21)', async () => {
  const fxA = await createGroundCanteenFixture('order-same-mobile-a')
  const fxB = await createGroundCanteenFixture('order-same-mobile-b')
  const user = await createUser('same-mobile')
  try {
    const orderA = await insertOrder({ userId: user.id, canteenId: fxA.canteen.id, customerName: user.name, seatId: 'A1', items: sampleItems(), total: 100 })
    const orderB = await insertOrder({ userId: user.id, canteenId: fxB.canteen.id, customerName: user.name, seatId: 'B1', items: sampleItems(), total: 100 })
    assert.notEqual(orderA.id, orderB.id, 'both orders must succeed — this is the entire point of per-canteen tenancy')

    // But a SECOND active order at the SAME canteen must still be rejected.
    await assert.rejects(
      () => insertOrder({ userId: user.id, canteenId: fxA.canteen.id, customerName: user.name, seatId: 'A2', items: sampleItems(), total: 50 }),
      (err) => err.code === '23505',
      'the per-(canteen,user) uniqueness must still block a second active order at the SAME canteen',
    )

    // Order history is canteen-scoped: A's history never shows B's order, and vice versa.
    const historyA = await findOrderHistoryByUserId(user.id, fxA.canteen.id)
    const historyB = await findOrderHistoryByUserId(user.id, fxB.canteen.id)
    assert.equal(historyA.length, 1)
    assert.equal(historyA[0].id, orderA.id)
    assert.equal(historyB.length, 1)
    assert.equal(historyB[0].id, orderB.id)
  } finally {
    await user.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

test('orders: findOrderById/updateOrderStatusByPublicId scoped to the WRONG canteen affect nothing (Step 26 ownership)', async () => {
  const fxA = await createGroundCanteenFixture('order-ownership-a')
  const fxB = await createGroundCanteenFixture('order-ownership-b')
  const user = await createUser('ownership')
  try {
    const order = await insertOrder({ userId: user.id, canteenId: fxA.canteen.id, customerName: user.name, seatId: 'A1', items: sampleItems(), total: 100 })

    // Canteen B's staff can never fetch or mutate Canteen A's order by id.
    const wrongCanteenFetch = await findOrderById(order.public_order_id, fxB.canteen.id)
    assert.equal(wrongCanteenFetch, null, 'a real order id belonging to a different canteen must resolve to null, same as "not found"')

    const wrongCanteenUpdate = await updateOrderStatusByPublicId(order.public_order_id, fxB.canteen.id, 'Completed')
    assert.equal(wrongCanteenUpdate, null, 'a status update scoped to the wrong canteen must affect zero rows')

    const stillPending = await findOrderById(order.public_order_id, fxA.canteen.id)
    assert.equal(stillPending.status, 'Pending', 'the order must be completely untouched by the cross-canteen update attempt')

    // The RIGHT canteen can still manage its own order normally.
    const rightCanteenUpdate = await updateOrderStatusByPublicId(order.public_order_id, fxA.canteen.id, 'Completed')
    assert.ok(rightCanteenUpdate)
    assert.equal(rightCanteenUpdate.status, 'Completed')
  } finally {
    await user.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

test('orders: CONCURRENCY — same user, DIFFERENT canteens, simultaneous creates both succeed (Step 22)', async () => {
  const fxA = await createGroundCanteenFixture('order-concurrency-a')
  const fxB = await createGroundCanteenFixture('order-concurrency-b')
  const user = await createUser('concurrency-diff-canteen')
  try {
    const [a, b] = await Promise.all([
      insertOrder({ userId: user.id, canteenId: fxA.canteen.id, customerName: user.name, seatId: 'A1', items: sampleItems(), total: 100 }),
      insertOrder({ userId: user.id, canteenId: fxB.canteen.id, customerName: user.name, seatId: 'B1', items: sampleItems(), total: 100 }),
    ])
    assert.notEqual(a.id, b.id)

    const activeA = await findActiveOrderByUserId(user.id, fxA.canteen.id)
    const activeB = await findActiveOrderByUserId(user.id, fxB.canteen.id)
    assert.ok(activeA)
    assert.ok(activeB)
  } finally {
    await user.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Section D — Order item cross-canteen resolution (Step 14, Invariant 5)
// ---------------------------------------------------------------------------

test('order_items: an item id referencing a DIFFERENT canteen resolves to menu_item_id=NULL — order still succeeds (preserves existing "fabricated id always works" business rule), but never cross-links', async () => {
  const fxA = await createGroundCanteenFixture('order-item-a')
  const fxB = await createGroundCanteenFixture('order-item-b')
  const user = await createUser('cross-canteen-item')
  try {
    const itemB = await insertMenuItem({ canteenId: fxB.canteen.id, name: 'B Item', category: 'Snacks', price: 20 })

    // Client claims Canteen B's real item id while ordering at Canteen A.
    const order = await insertOrder({
      userId: user.id,
      canteenId: fxA.canteen.id,
      customerName: user.name,
      seatId: 'A1',
      items: [{ id: String(itemB.id), foodId: String(itemB.id), name: 'B Item (claimed at A)', price: 20, qty: 1 }],
      total: 20,
    })

    assert.equal(order.items.length, 1, 'the order is still created — Order never hard-rejects an item id (existing, tested business rule)')
    const { rows } = await pool.query('SELECT menu_item_id FROM order_items WHERE order_id = $1', [order.id])
    assert.equal(rows[0].menu_item_id, null, 'Invariant 5: a cross-canteen id must resolve to NULL, structurally never linking to another canteen\'s menu item')
  } finally {
    await user.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
  }
})

// ---------------------------------------------------------------------------
// Section E — requireCanteenStaffAccess OR-composition, against the REAL
// wired routes and the REAL single canteen (Step 16/17/18).
// ---------------------------------------------------------------------------

test('requireCanteenStaffAccess: legacy super_admin still works unchanged (no regression for existing staff)', async () => {
  const server = await startTestApp()
  const snapshot = await snapshotRealTodayMenu()
  const superAdminRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)).rows[0].id
  const admin = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Admin', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
      [`integration-test-tenancy-admin-${Date.now()}@example.test`, superAdminRoleId],
    )
  ).rows[0]
  try {
    // Phase 6 — authorizeResolvedCanteen's Super-Admin branch now requires
    // req.mfaVerified, which a bare JWT can never satisfy. A REAL,
    // already-MFA-verified session cookie is minted directly — see
    // helpers/mfaFixtures.js (this test isn't about MFA, only that legacy
    // super_admin canteen access still works).
    const { cookie } = await mintMfaVerifiedSessionCookie(admin.id)

    // Republish the SAME snapshot back — a real write path exercise without
    // actually changing observable content.
    const res = await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: snapshot ? snapshot.items : [] }),
    })
    assert.equal(res.status, 200, 'legacy super_admin must still be able to manage the menu, exactly as before Phase 10')
  } finally {
    await restoreRealTodayMenu(snapshot)
    await pool.query('DELETE FROM users WHERE id = $1', [admin.id])
    await server.close()
  }
})

test('requireCanteenStaffAccess: a real ground_users GROUND_ADMIN membership at the REAL ground grants menu access WITHOUT any legacy staff_role', async () => {
  const server = await startTestApp()
  const snapshot = await snapshotRealTodayMenu()
  const user = await createUser('real-ground-admin', { role: 'staff' }) // role='staff' but staff_role_id NULL — no legacy path
  const membership = await createMembership({ groundId: realCanteen.ground_id, userId: user.id, role: 'GROUND_ADMIN' })
  try {
    const res = await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: snapshot ? snapshot.items : [] }),
    })
    assert.equal(res.status, 200, 'a real ground_users GROUND_ADMIN membership at the ground that owns "the" canteen must be sufficient on its own')
  } finally {
    await restoreRealTodayMenu(snapshot)
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membership.id])
    await user.cleanup()
    await server.close()
  }
})

test('requireCanteenStaffAccess: a ground_users membership at an UNRELATED ground does NOT grant access to the real canteen (403)', async () => {
  const server = await startTestApp()
  // A GROUND-ONLY fixture (no canteen row) — this test only needs a
  // different ground to hold the membership; it never touches a canteen of
  // its own. Deliberately does NOT create a second `canteens` row: the
  // TRANSITIONAL route under test here (findSingleCanteen) requires
  // EXACTLY one canteen to exist to remain safe (Phase 11 Step 20) — that
  // exact "what if a second canteen exists" scenario has its own dedicated
  // test below and in canteenGroundContext.integration.test.js.
  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `integration-test-tenancy-unrelated-ground-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      'Integration Test Unrelated Ground',
    ])
  ).rows[0]
  const user = await createUser('unrelated-ground-admin', { role: 'staff' })
  const membership = await createMembership({ groundId: ground.id, userId: user.id, role: 'GROUND_ADMIN' })
  try {
    // A denied request never reaches replaceTodayMenu — no snapshot/restore
    // needed here, but the payload is still harmless-shaped for clarity.
    const res = await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    assert.equal(res.status, 403, 'membership at a DIFFERENT ground must never authorize the real canteen')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membership.id])
    await user.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('requireCanteenStaffAccess: CANTEEN_STAFF membership is sufficient for order administration but NOT menu administration (mirrors the pre-existing legacy split)', async () => {
  const server = await startTestApp()
  const user = await createUser('canteen-staff-member', { role: 'staff' })
  const membership = await createMembership({ groundId: realCanteen.ground_id, userId: user.id, role: 'CANTEEN_STAFF' })
  try {
    const orderRes = await fetch(`${server.baseUrl}/canteen/orders`, { headers: { Authorization: `Bearer ${user.token}` } })
    assert.equal(orderRes.status, 200, 'CANTEEN_STAFF must be allowed to list orders (mirrors legacy requireRole(\'staff\'), which included canteen_staff)')

    // Denied before reaching replaceTodayMenu — no snapshot/restore needed.
    const menuRes = await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    assert.equal(menuRes.status, 403, 'CANTEEN_STAFF must NOT be allowed to manage the menu (mirrors legacy requireStaffRole(\'super_admin\',\'admin\'), which excluded canteen_staff)')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membership.id])
    await user.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Section F — IDOR: client-supplied canteen id is never consulted (Step 18),
// and Phase 11 Step 20's fail-safe: the transitional route must never
// silently guess once it can no longer prove there is exactly one canteen.
// ---------------------------------------------------------------------------

test('IDOR: a canteen_id/canteenId/ground_id claimed in the order body is never consulted, while exactly one canteen exists', async () => {
  const server = await startTestApp()
  const user = await createUser('idor-order')
  // Phase 17.1 — order items are now resolved server-side against a real
  // menu item belonging to the (server-resolved) canteen; sampleItems()'s
  // fake id is no longer accepted. This test is about the IDOR claim
  // (canteen_id/ground_id in the body being ignored), not pricing — a real
  // item on the real, server-resolved canteen exercises that exact claim.
  const { rows: [item] } = await pool.query(
    `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ('IDOR Test Item','Snacks',10,$1,true,50) RETURNING *`,
    [realCanteen.id],
  )
  try {
    const res = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seatId: 'A1',
        items: [{ id: item.id, qty: 1 }],
        canteen_id: 999999999,
        canteenId: 999999999,
        ground_id: 999999999,
      }),
    })
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
    const body = await res.json()

    const { rows } = await pool.query('SELECT canteen_id FROM orders WHERE public_order_id = $1', [body.order.id])
    assert.equal(rows[0].canteen_id, realCanteen.id, 'the order must be created under the server-resolved real canteen, never a client-claimed (here, nonexistent) one')
  } finally {
    await pool.query('DELETE FROM orders WHERE user_id = $1', [user.id])
    await pool.query('DELETE FROM menu_items WHERE id = $1', [item.id])
    await user.cleanup()
    await server.close()
  }
})

test('Phase 11 Step 20 fail-safe: the transitional /canteen/* routes refuse to guess (409) once a SECOND canteen genuinely exists — never silently serve canteen #1', async () => {
  const server = await startTestApp()
  const fx = await createGroundCanteenFixture('ambiguity-fail-safe')
  const user = await createUser('ambiguity-fail-safe')
  try {
    const res = await fetch(`${server.baseUrl}/canteen/menu`)
    assert.equal(res.status, 409, 'the legacy single-canteen route must fail safely, not silently pick a canteen, once it can no longer prove there is exactly one')

    const orderRes = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatId: 'A1', items: sampleItems(), total: 100 }),
    })
    assert.equal(orderRes.status, 409, 'order creation via the legacy route must also fail safely, never silently attach to an arbitrary canteen')
  } finally {
    await user.cleanup()
    await fx.cleanup()
    await server.close()
  }
})
