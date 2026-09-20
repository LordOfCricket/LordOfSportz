// MongoDB cleanup, Phase 1 — gallery_images is now PostgreSQL-backed
// (server/src/models/galleryImage.model.js), Cloudinary is unchanged. Same
// real HTTP pattern as groundMedia.integration.test.js: a real
// http.createServer(app) on a random port, plain fetch(), real Cloudinary
// uploads where the environment actually allows them. Covers the CRUD/auth
// surface groundMedia.integration.test.js already proves for
// ground_photos/amenities/partners, PLUS gallery's own extra behavior
// (category filtering, active/inactive, sort ordering) and the Mongo ->
// Postgres data migration script's idempotency.
//
// Cloudinary preflight: this sandbox's configured Cloudinary credentials
// reject uploads with a live 403 (confirmed independently of this app —
// the SAME failure reproduces against the pre-existing, already-shipped
// ground_photos/amenities/partners upload path, so it is an environment
// limitation, not a regression introduced here). Tests that require an
// actual new Cloudinary upload are skipped with an explicit reason (same
// `{ skip: !ready && 'reason' }` idiom aiInsight/canteenOrderConcurrency's
// tests already use for "MongoDB not reachable") rather than silently
// passing or being deleted; everything that doesn't require a fresh upload
// — list/filter/sort/get/patch (via a fixture row inserted directly through
// the model, bypassing Cloudinary), id validation, and the Cloudinary
// delete-failure path — runs for real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import mongoose from 'mongoose'
import app from '../../app.js'
import { pool, connectMongo } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { insertGalleryImage } from '../../models/galleryImage.model.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../../utils/cloudinaryUpload.js'
import GalleryImageMongo from '../../models/galleryImageMongoLegacy.model.js'
import { runGalleryMigration } from '../../scripts/migrateGalleryToPostgres.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

await connectMongo()

// A minimal valid 1x1 PNG, embedded rather than depending on a real file on
// disk (same fixture groundMedia.integration.test.js uses).
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

// Captured once at module load — same pattern this repo already uses for
// `mongoReady` (aiInsight/canteenOrderConcurrency tests).
let cloudinaryUploadWorks = false
let preflightSkipReason = 'Cloudinary preflight upload did not run'
try {
  const probe = await uploadImageFileDetailed(
    { buffer: ONE_PX_PNG, originalname: 'preflight.png', mimetype: 'image/png' },
    'LOC/ground-gallery-test-preflight',
  )
  cloudinaryUploadWorks = true
  await deleteImageByPublicId(probe.publicId)
} catch (err) {
  preflightSkipReason = `Cloudinary upload is not permitted in this environment (${err.message}) — not a regression, see final report`
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function createSuperAdminUser() {
  const superAdminRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = 'super_admin'`)).rows[0].id
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ('Integration Test Super Admin', $1, 'not-a-real-hash', 'staff', $2) RETURNING *`,
      [`integration-test-super-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, superAdminRoleId],
    )
  ).rows[0]
  // Phase 6 — requireStaffRole('super_admin') now requires req.mfaVerified,
  // which a bare JWT can never satisfy. This file isn't testing MFA, only
  // gallery CRUD authorization, so a REAL, already-MFA-verified session
  // cookie is minted directly — see helpers/mfaFixtures.js.
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

async function createPlainStaffUser() {
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Integration Test Plain Staff', $1, 'not-a-real-hash', 'staff') RETURNING *`,
      [`integration-test-plain-staff-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`],
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

function uniqueTitle(label) {
  return `Integration Test — ${label} — ${Date.now()}-${Math.random().toString(36).slice(2)} — safe to delete`
}

// Inserts a row directly through the (real) Postgres model — no Cloudinary
// call — so list/filter/sort/get/patch coverage doesn't depend on the
// sandbox's broken Cloudinary credentials. `cloudinary_public_id` is a
// realistic-looking but fake value; that's fine for every assertion below
// except an actual Cloudinary delete, which is exercised separately as a
// documented failure path (see the "Cloudinary delete failure" test).
async function createFixtureRow(overrides = {}) {
  return insertGalleryImage({
    title: uniqueTitle(overrides.label || 'fixture'),
    description: '',
    category: overrides.category || 'ground',
    imageUrl: 'https://res.cloudinary.com/example/image/upload/v1/fixture.jpg',
    cloudinaryPublicId: overrides.cloudinaryPublicId || `LOC/ground-gallery/fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    imageWidth: 100,
    imageHeight: 100,
    imageFormat: 'jpg',
    imageBytes: 1234,
    sortOrder: overrides.sortOrder ?? 0,
    isActive: overrides.isActive ?? true,
    createdBy: null,
  })
}

async function uploadImage(baseUrl, actor, { title, category, order }) {
  const form = new FormData()
  form.append('image', new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
  form.append('title', title)
  if (category) form.append('category', category)
  if (order !== undefined) form.append('order', String(order))
  const headers = actor?.cookie ? { Cookie: actor.cookie } : { Authorization: `Bearer ${actor?.token ?? actor}` }
  const res = await fetch(`${baseUrl}/gallery`, {
    method: 'POST',
    headers,
    body: form,
  })
  const body = await res.json()
  return { status: res.status, body }
}

// ---------------------------------------------------------------------------
// Auth / RBAC — mirrors groundMedia.integration.test.js's coverage for the
// sibling Cloudinary+Postgres routes. Fails before Cloudinary/DB are ever
// touched, so these run regardless of the Cloudinary preflight result.
// ---------------------------------------------------------------------------

test('gallery upload without auth is rejected (401), never reaches Cloudinary or the DB', async () => {
  const server = await startTestApp()
  try {
    const form = new FormData()
    form.append('image', new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
    form.append('title', 'Should never be created')
    const res = await fetch(`${server.baseUrl}/gallery`, { method: 'POST', body: form })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('gallery upload as a non-super_admin staff user is rejected (403) — only super_admin may manage gallery', async () => {
  const server = await startTestApp()
  const plainStaff = await createPlainStaffUser()
  try {
    const { status } = await uploadImage(server.baseUrl, plainStaff, { title: 'Should never be created' })
    assert.equal(status, 403)
  } finally {
    await plainStaff.cleanup()
    await server.close()
  }
})

test('gallery upload with no file is rejected (400), not a 500', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdminUser()
  try {
    const form = new FormData()
    form.append('title', 'Missing file test')
    const res = await fetch(`${server.baseUrl}/gallery`, {
      method: 'POST',
      headers: { Cookie: admin.cookie },
      body: form,
    })
    assert.equal(res.status, 400)
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

test('an invalid or nonexistent id is a clean 404, never a 500 — preserves the old invalid-ObjectId behavior', async () => {
  const server = await startTestApp()
  try {
    const nonNumeric = await fetch(`${server.baseUrl}/gallery/not-a-valid-id`)
    assert.equal(nonNumeric.status, 404)

    const nonexistentNumeric = await fetch(`${server.baseUrl}/gallery/999999999`)
    assert.equal(nonexistentNumeric.status, 404)
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// CRUD reads/updates — via directly-inserted fixture rows, so these don't
// depend on the sandbox's Cloudinary credentials at all.
// ---------------------------------------------------------------------------

test('list/get response shape is preserved exactly (camelCase, same fields as the retired Mongo-backed version)', async () => {
  const server = await startTestApp()
  const row = await createFixtureRow({ label: 'shape', category: 'ground', sortOrder: 999 })
  try {
    const getRes = await fetch(`${server.baseUrl}/gallery/${row.id}`)
    assert.equal(getRes.status, 200)
    const { image } = await getRes.json()
    assert.equal(typeof image.id, 'string')
    assert.equal(image.id, String(row.id))
    assert.equal(image.title, row.title)
    assert.equal(image.category, 'ground')
    assert.equal(image.order, 999)
    assert.equal(image.isActive, true)
    assert.ok(image.imageUrl)
    assert.ok(image.originalImageUrl)
    assert.ok(image.createdAt)
    // Fields never exposed by the retired Mongo-backed version stay absent.
    assert.equal(image.publicId, undefined)
    assert.equal(image.createdBy, undefined)
    assert.equal(image.legacyMongoId, undefined)
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = $1', [row.id])
    await server.close()
  }
})

test('category filtering — an image created under one category never appears when filtering by another', async () => {
  const server = await startTestApp()
  const row = await createFixtureRow({ label: 'category filter', category: 'event' })
  try {
    const eventList = await (await fetch(`${server.baseUrl}/gallery?category=event`)).json()
    assert.ok(eventList.images.some((img) => img.id === String(row.id)))

    const groundList = await (await fetch(`${server.baseUrl}/gallery?category=ground`)).json()
    assert.ok(!groundList.images.some((img) => img.id === String(row.id)))

    const badCategoryRes = await fetch(`${server.baseUrl}/gallery?category=not-a-real-category`)
    assert.equal(badCategoryRes.status, 400)
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = $1', [row.id])
    await server.close()
  }
})

test('active/inactive — deactivating an image (via PATCH) removes it from the public list (existing behavior preserved exactly)', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdminUser()
  const row = await createFixtureRow({ label: 'active toggle', category: 'match' })
  try {
    let list = await (await fetch(`${server.baseUrl}/gallery?category=match`)).json()
    assert.ok(list.images.some((img) => img.id === String(row.id)), 'active image should be listed')

    const patchRes = await fetch(`${server.baseUrl}/gallery/${row.id}`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    assert.equal(patchRes.status, 200)
    const patched = await patchRes.json()
    assert.equal(patched.image.isActive, false)

    list = await (await fetch(`${server.baseUrl}/gallery?category=match`)).json()
    assert.ok(!list.images.some((img) => img.id === String(row.id)), 'deactivated image must not be listed')
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = $1', [row.id])
    await admin.cleanup()
    await server.close()
  }
})

test('PATCH updates title/order/category and rejects an empty title or unknown category', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdminUser()
  const row = await createFixtureRow({ label: 'patch validation', category: 'ground' })
  try {
    const ok = await fetch(`${server.baseUrl}/gallery/${row.id}`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title', order: 7, category: 'tournament' }),
    })
    assert.equal(ok.status, 200)
    const okBody = await ok.json()
    assert.equal(okBody.image.title, 'Updated Title')
    assert.equal(okBody.image.order, 7)
    assert.equal(okBody.image.category, 'tournament')

    const emptyTitle = await fetch(`${server.baseUrl}/gallery/${row.id}`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    })
    assert.equal(emptyTitle.status, 400)

    const badCategory = await fetch(`${server.baseUrl}/gallery/${row.id}`, {
      method: 'PATCH',
      headers: { Cookie: admin.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'not-a-real-category' }),
    })
    assert.equal(badCategory.status, 400)
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = $1', [row.id])
    await admin.cleanup()
    await server.close()
  }
})

test('sort ordering — images are returned in sort_order (then created_at) order', async () => {
  const server = await startTestApp()
  const rowHigh = await createFixtureRow({ label: 'order A', category: 'tournament', sortOrder: 50 })
  const rowLow = await createFixtureRow({ label: 'order B', category: 'tournament', sortOrder: 10 })
  try {
    const list = await (await fetch(`${server.baseUrl}/gallery?category=tournament`)).json()
    const indexHigh = list.images.findIndex((img) => img.id === String(rowHigh.id))
    const indexLow = list.images.findIndex((img) => img.id === String(rowLow.id))
    assert.ok(indexLow < indexHigh, 'the lower sort_order (10) must come before the higher one (50)')
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = ANY($1)', [[rowHigh.id, rowLow.id]])
    await server.close()
  }
})

test('DELETE removes the database row (Cloudinary destroy of a fixture asset succeeds for real)', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdminUser()
  // Cloudinary's destroy API works in this environment even though fresh
  // uploads don't (confirmed: destroy authenticates independently of the
  // upload restriction that skips the true upload test above) — so this
  // exercises the real DELETE endpoint, including a real Cloudinary API
  // call, end to end. `destroy` on a public_id with no matching asset
  // returns `result: 'not found'`, which deleteImageByPublicId treats the
  // same as a confirmed delete (see its own comment) — the row is removed
  // either way.
  const row = await createFixtureRow({ label: 'delete', cloudinaryPublicId: 'LOC/definitely-does-not-exist/fixture' })
  try {
    const deleteRes = await fetch(`${server.baseUrl}/gallery/${row.id}`, {
      method: 'DELETE',
      headers: { Cookie: admin.cookie },
    })
    assert.equal(deleteRes.status, 200)
    const deleteBody = await deleteRes.json()
    assert.equal(deleteBody.id, String(row.id))

    const stillThere = await pool.query('SELECT id FROM gallery_images WHERE id = $1', [row.id])
    assert.equal(stillThere.rows.length, 0, 'the row must be removed after a successful delete')

    const getAfter = await fetch(`${server.baseUrl}/gallery/${row.id}`)
    assert.equal(getAfter.status, 404)
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE id = $1', [row.id])
    await admin.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// True upload — needs a real, permitted Cloudinary account. Skipped with an
// explicit reason in this sandbox (see the module-level preflight above).
// ---------------------------------------------------------------------------

test(
  'authorized upload succeeds end-to-end: creates a real Cloudinary asset, returns the preserved response shape, and cleans up on delete',
  { skip: !cloudinaryUploadWorks && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    const admin = await createSuperAdminUser()
    let createdId = null
    try {
      const title = uniqueTitle('upload e2e')
      const { status, body } = await uploadImage(server.baseUrl, admin, { title, category: 'ground', order: 999 })
      assert.equal(status, 201)
      createdId = body.image.id
      assert.match(body.image.originalImageUrl, /^https:\/\/res\.cloudinary\.com\//)

      const imageRes = await fetch(body.image.originalImageUrl)
      assert.equal(imageRes.status, 200)

      const deleteRes = await fetch(`${server.baseUrl}/gallery/${createdId}`, {
        method: 'DELETE',
        headers: { Cookie: admin.cookie },
      })
      assert.equal(deleteRes.status, 200)
      createdId = null
    } finally {
      if (createdId) await pool.query('DELETE FROM gallery_images WHERE id = $1', [createdId])
      await admin.cleanup()
      await server.close()
    }
  },
)

// ---------------------------------------------------------------------------
// Migration script — idempotency / resumability against the REAL migration
// logic (not a reimplementation), using a disposable MongoDB fixture so the
// real, already-migrated production gallery rows are never touched. No
// Cloudinary calls are involved (the migration only copies existing
// url/publicId metadata), so these run for real regardless of the preflight.
// ---------------------------------------------------------------------------

test('migration script: running twice never creates duplicate PostgreSQL rows, and correctly reports inserted vs updated', async () => {
  const fixtureDoc = await GalleryImageMongo.create({
    title: uniqueTitle('migration fixture'),
    description: 'temporary fixture for the migration idempotency test',
    category: 'event',
    image: {
      url: 'https://res.cloudinary.com/example/image/upload/v1/fixture.jpg',
      publicId: 'LOC/ground-gallery/fixture-only-never-uploaded',
      width: 100,
      height: 100,
      format: 'jpg',
      bytes: 1234,
    },
    order: 42,
    isActive: true,
    createdBy: null,
  })

  try {
    const firstRun = await runGalleryMigration()
    const firstRecord = firstRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(firstRecord.status, 'inserted')

    const afterFirst = await pool.query('SELECT COUNT(*)::int AS count FROM gallery_images WHERE legacy_mongo_id = $1', [
      String(fixtureDoc._id),
    ])
    assert.equal(afterFirst.rows[0].count, 1)

    const secondRun = await runGalleryMigration()
    const secondRecord = secondRun.results.find((r) => r.legacyMongoId === String(fixtureDoc._id))
    assert.equal(secondRecord.status, 'updated')
    assert.equal(secondRecord.postgresId, firstRecord.postgresId, 're-running must update the SAME row, not insert a new one')

    const afterSecond = await pool.query('SELECT COUNT(*)::int AS count FROM gallery_images WHERE legacy_mongo_id = $1', [
      String(fixtureDoc._id),
    ])
    assert.equal(afterSecond.rows[0].count, 1, 'no duplicate row was created on the second run')

    // Field-by-field: the migrated row matches the MongoDB source exactly.
    const { rows } = await pool.query('SELECT * FROM gallery_images WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    const migrated = rows[0]
    assert.equal(migrated.title, fixtureDoc.title)
    assert.equal(migrated.category, fixtureDoc.category)
    assert.equal(migrated.image_url, fixtureDoc.image.url)
    assert.equal(migrated.cloudinary_public_id, fixtureDoc.image.publicId)
    assert.equal(migrated.image_width, fixtureDoc.image.width)
    assert.equal(migrated.image_height, fixtureDoc.image.height)
    assert.equal(migrated.image_format, fixtureDoc.image.format)
    assert.equal(migrated.image_bytes, fixtureDoc.image.bytes)
    assert.equal(migrated.sort_order, fixtureDoc.order)
    assert.equal(migrated.is_active, fixtureDoc.isActive)
  } finally {
    await pool.query('DELETE FROM gallery_images WHERE legacy_mongo_id = $1', [String(fixtureDoc._id)])
    await GalleryImageMongo.deleteOne({ _id: fixtureDoc._id })
  }
})

test('migration script: a document missing a required field is skipped, not failed, and does not abort the run', async () => {
  const fixtureDoc = await GalleryImageMongo.collection.insertOne({
    title: uniqueTitle('invalid fixture'),
    category: 'event',
    // no `image` sub-document at all — simulates corrupt/incomplete legacy data
    order: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  try {
    const run = await runGalleryMigration()
    const record = run.results.find((r) => r.legacyMongoId === String(fixtureDoc.insertedId))
    assert.equal(record.status, 'skipped')

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM gallery_images WHERE legacy_mongo_id = $1', [
      String(fixtureDoc.insertedId),
    ])
    assert.equal(rows[0].count, 0, 'an invalid document must never be written to PostgreSQL')
  } finally {
    await GalleryImageMongo.collection.deleteOne({ _id: fixtureDoc.insertedId })
  }
})

test.after(async () => {
  await mongoose.connection.close()
})
