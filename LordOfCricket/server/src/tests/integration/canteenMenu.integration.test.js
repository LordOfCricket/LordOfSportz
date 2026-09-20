// MongoDB cleanup, Phase 3 (MenuItem) + Phase 4 (TodayMenu) + Phase 5
// (Order) — all now PostgreSQL-backed (server/src/models/canteenMenuItem.
// model.js, canteenTodayMenu.model.js, canteenOrder.model.js). Real HTTP
// pattern matching groundMedia/galleryImage.integration.test.js: a real
// http.createServer(app) on a random port, plain fetch(). TodayMenu-
// specific migration/transaction/rollback tests live in their own file,
// canteenTodayMenu.integration.test.js, and Order's own CRUD/concurrency/
// migration tests live in canteenOrder.integration.test.js — this file
// keeps MenuItem CRUD plus the cross-feature MenuItem/TodayMenu/Order
// coordination tests it already had (updated Phase 5 to read Order via the
// new Postgres model instead of the retired Mongoose one).
//
// Cloudinary preflight: most tests here use `image` as a plain string field
// (createMenuItem/updateMenuItem accept that with zero Cloudinary
// involvement — see the controller), sidestepping this sandbox's broken
// Cloudinary upload credentials (see Phase 1's report) entirely. Only the
// one test that uploads a REAL file needs the preflight skip guard.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import mongoose from 'mongoose'
import app from '../../app.js'
import { pool, connectMongo } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { getTodayMenu, replaceTodayMenu } from '../../models/canteenTodayMenu.model.js'
import { findOrderById } from '../../models/canteenOrder.model.js'
import { findSingleCanteen } from '../../models/canteen.model.js'
import MenuItemMongo from '../../models/canteenMenuItemMongoLegacy.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../../utils/cloudinaryUpload.js'
import { runMenuItemMigration } from '../../scripts/migrateMenuItemsToPostgres.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

await connectMongo()

// Phase 10 — every route under test is now canteen-scoped (attachCurrentCanteen/
// requireCanteenStaffAccess resolve "the" single canteen server-side); tests
// that call the model layer directly (snapshotTodayMenu/restoreTodayMenu,
// findOrderById) need that same canteen id.
//
// Phase 11: this top-level await throws AmbiguousCanteenError (crashing this
// file's module load) if a second `canteens` row exists anywhere in the DB
// at the moment this file loads — which genuinely happens if
// groundCanteenContext.integration.test.js's temporary multi-canteen
// fixtures are mid-flight in a different worker process. That's why
// package.json's test:integration script runs with --test-concurrency=1
// (node --test parallelizes files by default); don't drop that flag without
// re-verifying the full suite serially first.
const canteen = await findSingleCanteen()

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

let cloudinaryUploadWorks = false
let preflightSkipReason = 'Cloudinary preflight upload did not run'
try {
  const probe = await uploadImageFileDetailed({ buffer: ONE_PX_PNG, originalname: 'preflight.png', mimetype: 'image/png' }, 'canteen-menu-test-preflight')
  cloudinaryUploadWorks = true
  await deleteImageByPublicId(probe.publicId)
} catch (err) {
  preflightSkipReason = `Cloudinary upload is not permitted in this environment (${err.message}) — not a regression, see Phase 1/3 reports`
}

// canteenMenu.controller.js/canteenOrder.controller.js call `req.io.emit(...)`
// / `req.io.to(rooms).emit(...)` unconditionally (app.js's own middleware
// comment: "so canteen controllers can keep using req.io.emit(...)
// unchanged" — app.locals.io is normally set by server.js, which this test,
// like every other integration test here, doesn't boot). A no-op stub is
// enough — these tests assert on HTTP responses/DB state, not socket
// delivery (cricketRealtimePublish/commentary's own tests already cover
// real Socket.IO delivery for the match-room side of this app).
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

async function createStaffUser({ staffRole } = {}) {
  let staffRoleId = null
  if (staffRole) {
    staffRoleId = (await pool.query('SELECT id FROM staff_roles WHERE name = $1', [staffRole])).rows[0].id
  }
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Staff', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
      [`integration-test-canteen-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, staffRoleId],
    )
  ).rows[0]
  // Phase 6 — authorizeResolvedCanteen's Super-Admin/GROUND_OWNER branches
  // now require req.mfaVerified, which a bare JWT can never satisfy. A REAL,
  // already-MFA-verified session cookie is minted directly — see
  // helpers/mfaFixtures.js (this file isn't testing MFA, only canteen menu
  // CRUD).
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    cookie,
    async cleanup() {
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function uniqueName(label) {
  return `Integration Test — ${label} — ${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function createItem(baseUrl, actor, { name, category = 'Snacks', price = 100, description = '', defaultStock = 10, image } = {}) {
  const body = new URLSearchParams({ name, category, price: String(price), description, defaultStock: String(defaultStock) })
  if (image) body.set('image', image)
  const authHeaders = actor?.cookie ? { Cookie: actor.cookie } : { Authorization: `Bearer ${actor?.token ?? actor}` }
  const res = await fetch(`${baseUrl}/canteen/menu/master`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json()
  return { status: res.status, body: json }
}

async function cleanupItem(id) {
  if (id != null) await pool.query('DELETE FROM menu_items WHERE id = $1', [id])
}

// Test-isolation fix (Phase 3A, carried forward into Phase 4's Postgres-
// backed TodayMenu): `PATCH /canteen/menu/today` REPLACES the entire set of
// published items (see updateTodaysMenu/replaceTodayMenu) — it is not
// additive. Any test that publishes today's menu must snapshot whatever
// was already published BEFORE it writes, and restore that exact snapshot
// afterward, or it silently destroys real (possibly staff-configured)
// shared dev data — precisely the Phase 3A incident.
async function snapshotTodayMenu() {
  const today = await getTodayMenu(canteen.id)
  if (!today) return null
  return {
    publishedAt: today.published_at,
    items: today.items.map((row) => ({ id: String(row.menu_item_id), available: row.available, stock: row.stock, dailyPrice: Number(row.daily_price) })),
  }
}

async function restoreTodayMenu(snapshot) {
  // replaceTodayMenu always operates on "the" one today_menu row (creating
  // it if none exists) — passing an empty items array when there was no
  // prior snapshot correctly leaves it empty, matching the "no document at
  // all" Mongo-era case closely enough for test purposes (a fresh dev DB
  // has no today_menu row before the first publish either way).
  await replaceTodayMenu({
    canteenId: canteen.id,
    publishedAt: snapshot ? snapshot.publishedAt : new Date().toISOString(),
    items: snapshot ? snapshot.items : [],
  })
}

// ---------------------------------------------------------------------------
// Auth / RBAC
// ---------------------------------------------------------------------------

test('create menu item without auth is rejected (401)', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/canteen/menu/master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'x', category: 'y', price: '1' }),
    })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('create menu item as plain staff (no staff_role_id) is rejected (403) — admin management stays super_admin/admin only', async () => {
  const server = await startTestApp()
  const plainStaff = await createStaffUser()
  try {
    const { status } = await createItem(server.baseUrl, plainStaff, { name: 'Should never be created', category: 'x' })
    assert.equal(status, 403)
  } finally {
    await plainStaff.cleanup()
    await server.close()
  }
})

test('public menu read endpoints require no auth', async () => {
  const server = await startTestApp()
  try {
    assert.equal((await fetch(`${server.baseUrl}/canteen/menu`)).status, 200)
    assert.equal((await fetch(`${server.baseUrl}/canteen/menu/master`)).status, 200)
    assert.equal((await fetch(`${server.baseUrl}/canteen/menu/today/config`)).status, 200)
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// CRUD + response-shape preservation
// ---------------------------------------------------------------------------

test('authorized create/read/update/delete round-trip preserves the exact response shape', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  let createdId = null
  try {
    const name = uniqueName('CRUD')
    const created = await createItem(server.baseUrl, admin, { name, category: 'Mains', price: 149.5, description: 'desc', defaultStock: 20, image: 'https://example.com/pic.jpg' })
    assert.equal(created.status, 201)
    createdId = Number(created.body.item.id)
    assert.equal(typeof created.body.item.id, 'string')
    assert.equal(created.body.item.name, name)
    assert.equal(created.body.item.category, 'Mains')
    assert.equal(created.body.item.price, 149.5)
    assert.equal(created.body.item.description, 'desc')
    assert.equal(created.body.item.defaultStock, 20)
    assert.equal(created.body.item.image, 'https://example.com/pic.jpg')
    // legacy_mongo_id must never leak through the API.
    assert.equal(created.body.item.legacy_mongo_id, undefined)
    assert.equal(created.body.item.legacyMongoId, undefined)

    // Appears in listMasterMenu.
    const masterList = await (await fetch(`${server.baseUrl}/canteen/menu/master`)).json()
    const inMaster = masterList.items.find((i) => i.id === created.body.item.id)
    assert.ok(inMaster, 'new item must appear in the master menu list')
    assert.equal(inMaster.isActive, true)

    // Appears in the public menu with default availability (no TodayMenu entry yet).
    const publicList = await (await fetch(`${server.baseUrl}/canteen/menu`)).json()
    const inPublic = publicList.items.find((i) => i.id === created.body.item.id)
    assert.ok(inPublic)
    assert.equal(inPublic.available, true, 'no TodayMenu entry yet -> defaults to available')
    assert.equal(inPublic.stock, 20, 'defaults to defaultStock')
    assert.equal(inPublic.dailyPrice, 149.5, 'defaults to base price')

    // Update.
    const updateRes = await fetch(`${server.baseUrl}/canteen/menu/master/${created.body.item.id}`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ price: '199' }),
    })
    assert.equal(updateRes.status, 200)
    const updateBody = await updateRes.json()
    assert.equal(updateBody.item.price, 199)
    assert.equal(updateBody.item.name, name, 'fields not included in the PATCH stay unchanged')
    assert.equal(updateBody.item.isActive, true)

    // Delete (soft — isActive:false).
    const deleteRes = await fetch(`${server.baseUrl}/canteen/menu/master/${created.body.item.id}`, {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    })
    assert.equal(deleteRes.status, 200)
    const deleteBody = await deleteRes.json()
    assert.equal(deleteBody.ok, true)

    const afterDelete = await pool.query('SELECT is_active FROM menu_items WHERE id = $1', [createdId])
    assert.equal(afterDelete.rows[0].is_active, false, 'delete is a soft deactivate, not a real row delete')

    const listAfterDelete = await (await fetch(`${server.baseUrl}/canteen/menu/master`)).json()
    assert.ok(!listAfterDelete.items.some((i) => i.id === created.body.item.id), 'deactivated item no longer appears in the active list')
  } finally {
    await cleanupItem(createdId)
    await admin.cleanup()
    await server.close()
  }
})

test('update/delete with an invalid or nonexistent id is a clean 404, never a 500', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'admin' })
  try {
    const updateRes = await fetch(`${server.baseUrl}/canteen/menu/master/not-a-valid-id`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ price: '1' }),
    })
    assert.equal(updateRes.status, 404)

    const deleteRes = await fetch(`${server.baseUrl}/canteen/menu/master/999999999`, {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    })
    assert.equal(deleteRes.status, 404)
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

test('invalid create payload (missing name/category, non-numeric price) is rejected with 400', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  try {
    const missingName = await createItem(server.baseUrl, admin, { name: '', category: 'x', price: 10 })
    assert.equal(missingName.status, 400)

    const badPrice = await createItem(server.baseUrl, admin, { name: 'x', category: 'y', price: 'not-a-number' })
    assert.equal(badPrice.status, 400)
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// TodayMenu linkage (MenuItem now Postgres, TodayMenu still MongoDB) —
// exercises the exact cross-store coordination this phase had to preserve.
// ---------------------------------------------------------------------------

test("TodayMenu publish validates ids against Postgres MenuItem, and getTodaysMenuConfig joins them back correctly", async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  const todayMenuSnapshot = await snapshotTodayMenu()
  let createdId = null
  try {
    const created = await createItem(server.baseUrl, admin, { name: uniqueName('today-menu'), category: 'Snacks', price: 75, defaultStock: 5 })
    createdId = Number(created.body.item.id)
    const itemId = created.body.item.id

    const publishRes = await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: itemId, available: true, stock: 3, dailyPrice: 60 },
          { id: 'this-id-does-not-exist-in-postgres', available: true, stock: 1, dailyPrice: 1 },
        ],
      }),
    })
    assert.equal(publishRes.status, 200)

    // getTodaysMenuConfig only returns entries that resolve to a real,
    // active Postgres MenuItem — the bogus id is silently dropped (matches
    // the retired code's own `.filter(Boolean)` behavior).
    const config = await (await fetch(`${server.baseUrl}/canteen/menu/today/config`)).json()
    const configEntry = config.items.find((i) => i.id === itemId)
    assert.ok(configEntry, 'the real id must resolve')
    assert.equal(configEntry.available, true)
    assert.equal(configEntry.stock, 3)
    assert.equal(configEntry.dailyPrice, 60)
    assert.ok(!config.items.some((i) => i.id === 'this-id-does-not-exist-in-postgres'))

    // listMenu reflects the same published override.
    const menu = await (await fetch(`${server.baseUrl}/canteen/menu`)).json()
    const menuEntry = menu.items.find((i) => i.id === itemId)
    assert.equal(menuEntry.available, true)
    assert.equal(menuEntry.stock, 3)
    assert.equal(menuEntry.dailyPrice, 60)
  } finally {
    // Restore whatever was actually published before this test ran — not
    // just remove this test's own addition (see snapshotTodayMenu's comment).
    await restoreTodayMenu(todayMenuSnapshot)
    await cleanupItem(createdId)
    await admin.cleanup()
    await server.close()
  }
})

test('deleting a MenuItem removes it from a published TodayMenu (existing cross-store behavior preserved exactly)', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  const todayMenuSnapshot = await snapshotTodayMenu()
  let createdId = null
  try {
    const created = await createItem(server.baseUrl, admin, { name: uniqueName('delete-cleans-today'), category: 'Snacks', price: 20 })
    createdId = Number(created.body.item.id)
    const itemId = created.body.item.id

    await fetch(`${server.baseUrl}/canteen/menu/today`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: itemId, available: true, stock: 1, dailyPrice: 20 }] }),
    })

    let today = await getTodayMenu(canteen.id)
    assert.ok(today.items.some((e) => e.menu_item_id === createdId), 'sanity check: published before delete')

    const deleteRes = await fetch(`${server.baseUrl}/canteen/menu/master/${itemId}`, {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    })
    assert.equal(deleteRes.status, 200)

    today = await getTodayMenu(canteen.id)
    assert.ok(!today.items.some((e) => e.menu_item_id === createdId), 'deleting the MenuItem must remove its TodayMenu entry, same as before this migration')
  } finally {
    await restoreTodayMenu(todayMenuSnapshot)
    await cleanupItem(createdId)
    await admin.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Historical Order safety (Step 12) — Order never looks up MenuItem, at
// creation or afterward. Proven directly, not just read from code.
// ---------------------------------------------------------------------------

test('Order creation never looks up MenuItem — an order referencing a nonexistent foodId still succeeds and snapshots its own name/price', async () => {
  const server = await startTestApp()
  const player = await createStaffUser() // any authenticated user works for placing an order
  try {
    const res = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${player.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seatId: 'A1',
        items: [{ id: 'totally-fabricated-food-id-no-such-menu-item', foodId: 'totally-fabricated-food-id-no-such-menu-item', name: 'Ghost Item', price: 55, qty: 2 }],
        total: 110,
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.order.items[0].name, 'Ghost Item')
    assert.equal(body.order.items[0].price, 55)
  } finally {
    await pool.query('DELETE FROM orders WHERE user_id = $1', [player.id])
    await player.cleanup()
    await server.close()
  }
})

test('deleting a MenuItem never changes a historical Order that already snapshotted its name/price', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  const customer = await createStaffUser()
  let createdId = null
  try {
    const created = await createItem(server.baseUrl, admin, { name: uniqueName('order-snapshot'), category: 'Snacks', price: 88 })
    createdId = Number(created.body.item.id)
    const itemId = created.body.item.id

    const orderRes = await fetch(`${server.baseUrl}/canteen/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatId: 'B2', items: [{ id: itemId, foodId: itemId, name: created.body.item.name, price: 88, qty: 1 }], total: 88 }),
    })
    assert.equal(orderRes.status, 200)
    const orderId = (await orderRes.json()).order.id

    // Delete (deactivate) the MenuItem the order referenced.
    await fetch(`${server.baseUrl}/canteen/menu/master/${itemId}`, { method: 'DELETE', headers: { Cookie: admin.cookie } })

    const orderAfter = await findOrderById(orderId, canteen.id)
    assert.equal(orderAfter.items[0].name, created.body.item.name, 'the order keeps its own snapshot, independent of the MenuItem row')
    assert.equal(orderAfter.items[0].price, 88)
  } finally {
    await pool.query('DELETE FROM orders WHERE user_id = $1', [customer.id])
    await cleanupItem(createdId)
    await admin.cleanup()
    await customer.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Phase 7 — this route was the one upload endpoint in the app with no
// fileFilter/size limit at all (every sibling — ground-photos/amenities/
// gallery/partners — caps at 10MB and allow-lists image MIME types). Both
// checks run inside multer itself, before Cloudinary is ever reached, so
// neither test needs the cloudinaryUploadWorks preflight guard above.
// ---------------------------------------------------------------------------

test('canteen menu upload: rejects a non-image MIME type and a file over the 10MB limit', async () => {
  const server = await startTestApp()
  const admin = await createStaffUser({ staffRole: 'super_admin' })
  try {
    const badMimeForm = new FormData()
    badMimeForm.append('imageFile', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'evil.txt')
    badMimeForm.append('name', uniqueName('bad-mime'))
    badMimeForm.append('category', 'Snacks')
    badMimeForm.append('price', '10')
    const badMimeRes = await fetch(`${server.baseUrl}/canteen/menu/master`, {
      method: 'POST',
      headers: { Cookie: admin.cookie },
      body: badMimeForm,
    })
    assert.equal(badMimeRes.status, 400, 'a non-image MIME type must be rejected')

    const oversizedForm = new FormData()
    oversizedForm.append('imageFile', new Blob([Buffer.alloc(11 * 1024 * 1024)], { type: 'image/png' }), 'huge.png')
    oversizedForm.append('name', uniqueName('oversized'))
    oversizedForm.append('category', 'Snacks')
    oversizedForm.append('price', '10')
    const oversizedRes = await fetch(`${server.baseUrl}/canteen/menu/master`, {
      method: 'POST',
      headers: { Cookie: admin.cookie },
      body: oversizedForm,
    })
    assert.equal(oversizedRes.status, 400, 'a file over 10MB must be rejected')

    const leaked = (await pool.query('SELECT id FROM menu_items WHERE name IN ($1, $2)', [
      badMimeForm.get('name'),
      oversizedForm.get('name'),
    ])).rows
    assert.equal(leaked.length, 0, 'neither rejected upload must have created a menu item row')
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// True upload — needs a real, permitted Cloudinary account.
// ---------------------------------------------------------------------------

test(
  'creating a menu item with a real uploaded file stores a real Cloudinary asset',
  { skip: !cloudinaryUploadWorks && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    const admin = await createStaffUser({ staffRole: 'super_admin' })
    let createdId = null
    try {
      const form = new FormData()
      form.append('imageFile', new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
      form.append('name', uniqueName('upload'))
      form.append('category', 'Snacks')
      form.append('price', '10')
      const res = await fetch(`${server.baseUrl}/canteen/menu/master`, {
        method: 'POST',
        headers: { Cookie: admin.cookie },
        body: form,
      })
      assert.equal(res.status, 201)
      const body = await res.json()
      createdId = Number(body.item.id)
      assert.match(body.item.image, /^https:\/\/res\.cloudinary\.com\//)
    } finally {
      await cleanupItem(createdId)
      await admin.cleanup()
      await server.close()
    }
  },
)

// ---------------------------------------------------------------------------
// Migration script — idempotency / resumability against the REAL migration
// logic, using a disposable MongoDB fixture so the real, already-migrated
// production menu items are never touched.
// ---------------------------------------------------------------------------

test('migration script: running twice never creates duplicate PostgreSQL rows, and correctly reports inserted vs updated', async () => {
  const fixtureDoc = await MenuItemMongo.create({
    name: uniqueName('migration fixture'),
    category: 'Test',
    description: 'temporary fixture',
    price: 33.5,
    image: 'https://example.com/fixture.jpg',
    imagePublicId: 'canteen-menu/fixture-only-never-uploaded',
    defaultStock: 7,
    isActive: true,
  })

  try {
    const firstRun = await runMenuItemMigration()
    const firstRecord = firstRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(firstRecord.status, 'inserted')

    const secondRun = await runMenuItemMigration()
    const secondRecord = secondRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(secondRecord.status, 'updated')
    assert.equal(secondRecord.postgresId, firstRecord.postgresId)

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM menu_items WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    assert.equal(rows[0].count, 1, 'no duplicate row was created on the second run')

    const migrated = (await pool.query('SELECT * FROM menu_items WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])).rows[0]
    assert.equal(migrated.name, fixtureDoc.name)
    assert.equal(migrated.category, fixtureDoc.category)
    assert.equal(Number(migrated.price), fixtureDoc.price)
    assert.equal(migrated.image_url, fixtureDoc.image)
    assert.equal(migrated.cloudinary_public_id, fixtureDoc.imagePublicId)
    assert.equal(migrated.default_stock, fixtureDoc.defaultStock)
    assert.equal(migrated.is_active, fixtureDoc.isActive)
  } finally {
    await pool.query('DELETE FROM menu_items WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    await MenuItemMongo.deleteOne({ _id: fixtureDoc._id })
  }
})

test('migration script: a document missing a required field is skipped, not failed, and does not abort the run', async () => {
  const fixtureDoc = await MenuItemMongo.collection.insertOne({
    name: uniqueName('invalid fixture'),
    // no category, no price — simulates corrupt/incomplete legacy data
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  try {
    const run = await runMenuItemMigration()
    const record = run.results.find((r) => r.legacyMongoId === String(fixtureDoc.insertedId))
    assert.equal(record.status, 'skipped')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM menu_items WHERE legacy_mongo_id = $1', [String(fixtureDoc.insertedId)])
    assert.equal(rows[0].count, 0)
  } finally {
    await MenuItemMongo.collection.deleteOne({ _id: fixtureDoc.insertedId })
  }
})

test.after(async () => {
  await mongoose.connection.close()
})
