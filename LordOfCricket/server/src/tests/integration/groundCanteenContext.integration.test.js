// Phase 11 — real multi-ground/canteen URL context:
//   /grounds/:publicGroundId/canteens/:publicCanteenId/menu
//   /grounds/:publicGroundId/canteens/:publicCanteenId/orders
// Unlike canteenTenancy.integration.test.js (Phase 10, which tests the
// TRANSITIONAL single-canteen routes and their fail-safe behavior), every
// test here exercises the REAL ground/canteen-scoped routes end-to-end over
// HTTP — proving the full "URL -> Ground -> Canteen -> Authorization ->
// Resource" chain Phase 11 exists to build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

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
      [generatePublicId('GRD', 8), `integration-test-gcc-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`],
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
    async cleanup() {
      // menu_items/today_menu/orders -> canteens is NOT ON DELETE CASCADE
      // (schema.sql — business data must never vanish just because a
      // canteen row goes away), so any data created against this fixture's
      // canteen must be removed explicitly, in FK-safe order, first.
      await pool.query('DELETE FROM orders WHERE canteen_id = $1', [canteen.id])
      await pool.query('DELETE FROM today_menu WHERE canteen_id = $1', [canteen.id])
      await pool.query('DELETE FROM menu_items WHERE canteen_id = $1', [canteen.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id]) // cascades canteen, ground_users
    },
  }
}

async function createUser(label, { role = 'player', staffRoleId = null } = {}) {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1, $2, 'not-a-real-hash', $3, $4) RETURNING *`,
      [`Integration Test ${label}`, `integration-test-gcc-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, staffRoleId],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM orders WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

// Phase 6 — requireGroundCanteenRole's Super-Admin/GROUND_OWNER branches
// (via authorizeResolvedCanteen) now require req.mfaVerified. `elevate`
// mints a REAL, already-MFA-verified session cookie — see
// helpers/mfaFixtures.js (this file isn't testing MFA, only ground/canteen
// tenancy resolution).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function menuTodayUrl(baseUrl, ground, canteen) {
  return `${baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/menu/today`
}

function ordersUrl(baseUrl, ground, canteen) {
  return `${baseUrl}/grounds/${ground.public_ground_id}/canteens/${canteen.public_canteen_id}/orders`
}

// ---------------------------------------------------------------------------
// Step 22 — full authorization matrix
// ---------------------------------------------------------------------------

test('AUTH MATRIX: User A (GROUND_ADMIN at A) -> A/A ALLOW, A/B DENY(404), B/B DENY(403)', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('matrix-a')
  const fxB = await createGroundCanteenFixture('matrix-b')
  const userA = await createUser('matrix-user-a', { role: 'staff' })
  const membership = await createMembership({ groundId: fxA.ground.id, userId: userA.id, role: 'GROUND_ADMIN' })
  try {
    // A/A -> ALLOW
    const aa = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxA.canteen), { method: 'PATCH', headers: authHeader(userA.token), body: JSON.stringify({ items: [] }) })
    assert.equal(aa.status, 200, 'User A at Ground A / Canteen A must be ALLOWED')

    // A/B -> the URL claims Ground A but Canteen B actually belongs to Ground B: must 404, never silently reinterpreted.
    const ab = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxB.canteen), { method: 'PATCH', headers: authHeader(userA.token), body: JSON.stringify({ items: [] }) })
    assert.equal(ab.status, 404, 'a ground/canteen URL pair that does not actually correspond must 404, not silently switch tenant')

    // B/B -> User A has no membership at Ground B: DENY.
    const bb = await fetch(menuTodayUrl(server.baseUrl, fxB.ground, fxB.canteen), { method: 'PATCH', headers: authHeader(userA.token), body: JSON.stringify({ items: [] }) })
    assert.equal(bb.status, 403, 'User A must be denied at Ground B / Canteen B — no membership there')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membership.id])
    await userA.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

test('AUTH MATRIX: User B (GROUND_ADMIN at B) -> B/B ALLOW, B/A DENY(403)', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('matrix2-a')
  const fxB = await createGroundCanteenFixture('matrix2-b')
  const userB = await createUser('matrix-user-b', { role: 'staff' })
  const membership = await createMembership({ groundId: fxB.ground.id, userId: userB.id, role: 'GROUND_ADMIN' })
  try {
    const bb = await fetch(menuTodayUrl(server.baseUrl, fxB.ground, fxB.canteen), { method: 'PATCH', headers: authHeader(userB.token), body: JSON.stringify({ items: [] }) })
    assert.equal(bb.status, 200, 'User B at Ground B / Canteen B must be ALLOWED')

    const ba = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxA.canteen), { method: 'PATCH', headers: authHeader(userB.token), body: JSON.stringify({ items: [] }) })
    assert.equal(ba.status, 403, 'User B must be denied at Ground A / Canteen A — no membership there')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membership.id])
    await userB.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

test('AUTH MATRIX: Super Admin -> ALLOW at both Ground A/A and Ground B/B, with zero ground_users rows', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('matrix-sa-a')
  const fxB = await createGroundCanteenFixture('matrix-sa-b')
  const superAdminRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)).rows[0].id
  const superAdmin = await createUser('matrix-super-admin', { role: 'staff', staffRoleId: superAdminRoleId })
  await elevate(superAdmin)
  try {
    const aa = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxA.canteen), { method: 'PATCH', headers: cauth(superAdmin), body: JSON.stringify({ items: [] }) })
    assert.equal(aa.status, 200)
    const bb = await fetch(menuTodayUrl(server.baseUrl, fxB.ground, fxB.canteen), { method: 'PATCH', headers: cauth(superAdmin), body: JSON.stringify({ items: [] }) })
    assert.equal(bb.status, 200)

    const memberships = await pool.query('SELECT * FROM ground_users WHERE user_id = $1', [superAdmin.id])
    assert.equal(memberships.rows.length, 0, 'Super Admin must never need a membership row (Step 8)')
  } finally {
    await superAdmin.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

test('AUTH MATRIX: no authentication -> 401; unknown ground -> 404; unknown canteen -> 404', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('matrix-errors')
  try {
    const noAuth = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxA.canteen), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }) })
    assert.equal(noAuth.status, 401)

    const user = await createUser('matrix-errors-user')
    try {
      const unknownGround = await fetch(`${server.baseUrl}/grounds/GRD-DOESNOTEXIST/canteens/${fxA.canteen.public_canteen_id}/menu/today`, { method: 'PATCH', headers: authHeader(user.token), body: JSON.stringify({ items: [] }) })
      assert.equal(unknownGround.status, 404)

      const unknownCanteen = await fetch(`${server.baseUrl}/grounds/${fxA.ground.public_ground_id}/canteens/CAN-DOESNOTEXIST/menu/today`, { method: 'PATCH', headers: authHeader(user.token), body: JSON.stringify({ items: [] }) })
      assert.equal(unknownCanteen.status, 404)
    } finally {
      await user.cleanup()
    }
  } finally {
    await fxA.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Step 23 — IDOR: client-supplied context fields never override the URL
// ---------------------------------------------------------------------------

test('IDOR: body.canteen_id / body.ground_id / query.canteenId claiming a DIFFERENT tenant cannot switch context away from the URL', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('idor-a')
  const fxB = await createGroundCanteenFixture('idor-b')
  const userA = await createUser('idor-user-a', { role: 'player' })
  // Phase 17.1 — order items are now resolved server-side against a real
  // menu item belonging to the URL-resolved canteen; the old fake id: '1'
  // fixture is correctly rejected by that new validation. This test is
  // about the IDOR claim (body/query canteen/ground ids being ignored),
  // not pricing — a real item on canteen A (the URL-resolved one) exercises
  // that exact claim.
  const { rows: [itemA] } = await pool.query(
    `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ('Pizza','Food',100,$1,true,50) RETURNING *`,
    [fxA.canteen.id],
  )
  try {
    const res = await fetch(`${ordersUrl(server.baseUrl, fxA.ground, fxA.canteen)}?canteenId=${fxB.canteen.id}`, {
      method: 'POST',
      headers: authHeader(userA.token),
      body: JSON.stringify({
        seatId: 'A1',
        items: [{ id: itemA.id, qty: 1 }],
        canteen_id: fxB.canteen.id,
        ground_id: fxB.ground.id,
      }),
    })
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
    const body = await res.json()

    const { rows } = await pool.query('SELECT canteen_id FROM orders WHERE public_order_id = $1', [body.order.id])
    assert.equal(rows[0].canteen_id, fxA.canteen.id, 'the order must be created under the URL-resolved canteen A, never the body/query-claimed canteen B')
    assert.notEqual(rows[0].canteen_id, fxB.canteen.id)
  } finally {
    await userA.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

test('IDOR: an order id from Canteen B is 404 when fetched/updated through Canteen A staff routes', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('idor-order-a')
  const fxB = await createGroundCanteenFixture('idor-order-b')
  const staffA = await createUser('idor-order-staff-a', { role: 'staff' })
  const membershipA = await createMembership({ groundId: fxA.ground.id, userId: staffA.id, role: 'CANTEEN_STAFF' })
  const playerB = await createUser('idor-order-player-b', { role: 'player' })
  // Phase 17.1 — see the previous test's identical comment: a real menu
  // item (on canteen B, where this order is actually placed) replaces the
  // old fake-id fixture.
  const { rows: [itemB] } = await pool.query(
    `INSERT INTO menu_items (name, category, price, canteen_id, is_active, default_stock) VALUES ('Pizza','Food',100,$1,true,50) RETURNING *`,
    [fxB.canteen.id],
  )
  try {
    const placed = await fetch(ordersUrl(server.baseUrl, fxB.ground, fxB.canteen), {
      method: 'POST',
      headers: authHeader(playerB.token),
      body: JSON.stringify({ seatId: 'B1', items: [{ id: itemB.id, qty: 1 }] }),
    })
    assert.equal(placed.status, 200, JSON.stringify(await placed.clone().json()))
    const orderId = (await placed.json()).order.id

    const fetchFromA = await fetch(`${ordersUrl(server.baseUrl, fxA.ground, fxA.canteen)}/${orderId}`, { headers: authHeader(staffA.token) })
    assert.equal(fetchFromA.status, 404, 'Canteen A staff must never be able to fetch Canteen B\'s order by id')

    const updateFromA = await fetch(`${ordersUrl(server.baseUrl, fxA.ground, fxA.canteen)}/${orderId}/status`, { method: 'PATCH', headers: authHeader(staffA.token), body: JSON.stringify({ status: 'Completed' }) })
    assert.equal(updateFromA.status, 404, 'Canteen A staff must never be able to update Canteen B\'s order by id')

    const stillPending = await pool.query('SELECT status FROM orders WHERE public_order_id = $1', [orderId])
    assert.equal(stillPending.rows[0].status, 'Pending', 'the order must be completely untouched by the cross-canteen attempt')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id = $1', [membershipA.id])
    await staffA.cleanup()
    await playerB.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Step 24 — data isolation, read AND write, over real HTTP
// ---------------------------------------------------------------------------

test('DATA ISOLATION: Canteen A menu/TodayMenu/orders never appear under Canteen B\'s routes, and vice versa', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('isolation-a')
  const fxB = await createGroundCanteenFixture('isolation-b')
  const adminA = await createUser('isolation-admin-a', { role: 'staff' })
  const adminB = await createUser('isolation-admin-b', { role: 'staff' })
  const membershipA = await createMembership({ groundId: fxA.ground.id, userId: adminA.id, role: 'GROUND_ADMIN' })
  const membershipB = await createMembership({ groundId: fxB.ground.id, userId: adminB.id, role: 'GROUND_ADMIN' })
  try {
    // createMenuItem expects form-encoded, not JSON (multer).
    const formA = new URLSearchParams({ name: 'A Item', category: 'Snacks', price: '10' })
    const createdA = await fetch(`${server.baseUrl}/grounds/${fxA.ground.public_ground_id}/canteens/${fxA.canteen.public_canteen_id}/menu/master`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminA.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formA,
    })
    assert.equal(createdA.status, 201)

    const formB = new URLSearchParams({ name: 'B Item', category: 'Snacks', price: '20' })
    const createdB = await fetch(`${server.baseUrl}/grounds/${fxB.ground.public_ground_id}/canteens/${fxB.canteen.public_canteen_id}/menu/master`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminB.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formB,
    })
    assert.equal(createdB.status, 201)

    const menuA = await (await fetch(`${server.baseUrl}/grounds/${fxA.ground.public_ground_id}/canteens/${fxA.canteen.public_canteen_id}/menu/master`)).json()
    assert.ok(menuA.items.some((i) => i.name === 'A Item'))
    assert.ok(!menuA.items.some((i) => i.name === 'B Item'), 'Canteen A\'s menu list must never include Canteen B\'s item')

    const menuB = await (await fetch(`${server.baseUrl}/grounds/${fxB.ground.public_ground_id}/canteens/${fxB.canteen.public_canteen_id}/menu/master`)).json()
    assert.ok(menuB.items.some((i) => i.name === 'B Item'))
    assert.ok(!menuB.items.some((i) => i.name === 'A Item'), 'Canteen B\'s menu list must never include Canteen A\'s item')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id IN ($1,$2)', [membershipA.id, membershipB.id])
    await adminA.cleanup()
    await adminB.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Step 25 — same user, multiple grounds, no cross-request leakage, no JWT
// ground context (Phase 9's decision, kept — Step 25 explicitly).
// ---------------------------------------------------------------------------

test('SAME USER MULTI-GROUND: one user with OWNER at Ground A and SCORER-equivalent (CANTEEN_STAFF) at Ground B gets the correct, independent context per request', async () => {
  const server = await startTestApp()
  const fxA = await createGroundCanteenFixture('multi-ground-a')
  const fxB = await createGroundCanteenFixture('multi-ground-b')
  const user = await createUser('multi-ground-user', { role: 'staff' })
  const membershipOwnerA = await createMembership({ groundId: fxA.ground.id, userId: user.id, role: 'GROUND_OWNER' })
  const membershipStaffB = await createMembership({ groundId: fxB.ground.id, userId: user.id, role: 'CANTEEN_STAFF' })
  await elevate(user)
  try {
    // Same JWT, same user, two different requests -> two independently
    // resolved contexts. Nothing about "which ground" is cached anywhere
    // between requests (no ground context in the JWT — Phase 9/Step 25).
    const ownerAtA = await fetch(menuTodayUrl(server.baseUrl, fxA.ground, fxA.canteen), { method: 'PATCH', headers: cauth(user), body: JSON.stringify({ items: [] }) })
    assert.equal(ownerAtA.status, 200, 'GROUND_OWNER at Ground A must manage Ground A\'s menu')

    // CANTEEN_STAFF at Ground B is NOT sufficient for menu management there (mirrors the legacy split).
    const staffAtB = await fetch(menuTodayUrl(server.baseUrl, fxB.ground, fxB.canteen), { method: 'PATCH', headers: authHeader(user.token), body: JSON.stringify({ items: [] }) })
    assert.equal(staffAtB.status, 403, 'CANTEEN_STAFF must not be sufficient for menu administration, even at a ground the user genuinely belongs to')

    // But CANTEEN_STAFF at B IS sufficient for order administration at B.
    const orderListAtB = await fetch(ordersUrl(server.baseUrl, fxB.ground, fxB.canteen), { headers: authHeader(user.token) })
    assert.equal(orderListAtB.status, 200)

    // And the same user has no role at all beyond OWNER at A -> order admin at A also works (OWNER implies broader access).
    const orderListAtA = await fetch(ordersUrl(server.baseUrl, fxA.ground, fxA.canteen), { headers: authHeader(user.token) })
    assert.equal(orderListAtA.status, 200)

    const jwtPayload = JSON.parse(Buffer.from(user.token.split('.')[1], 'base64url').toString())
    assert.deepEqual(Object.keys(jwtPayload).filter((k) => !['iat', 'exp'].includes(k)), ['id'], 'the JWT must carry nothing but the user id — no ground/canteen context (Phase 9 Step 18, kept)')
  } finally {
    await pool.query('DELETE FROM ground_users WHERE id IN ($1,$2)', [membershipOwnerA.id, membershipStaffB.id])
    await user.cleanup()
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})
