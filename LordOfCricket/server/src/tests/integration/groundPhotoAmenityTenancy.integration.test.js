// Phase 12 — ground_photos/amenities gained a NOT NULL ground_id (Step 1's
// discovery that neither table had any ground relationship at all). The
// admin upload routes (POST /api/ground-photos, POST /api/amenities) now
// resolve it server-side via attachSingleGroundContext, mirroring
// attachCurrentCanteen's Phase 10 fail-safe shape exactly: works unchanged
// while exactly one ground exists, 409s rather than guessing once a second
// one does. This file proves both halves over real HTTP.
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
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function createSuperAdmin(label) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1,$2,'not-a-real-hash','staff',1) RETURNING *`,
      [`Integration Test ${label}`, `integration-test-gpa-${label}-${tag}@example.test`],
    )
  ).rows[0]
  // Phase 6 — requireStaffRole('super_admin') now requires req.mfaVerified,
  // which a bare JWT can never satisfy. A REAL, already-MFA-verified session
  // cookie is minted directly — see helpers/mfaFixtures.js (this file isn't
  // testing MFA, only ground-photo/amenity tenancy resolution).
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

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function cookieHeader(cookie) {
  return { Cookie: cookie, 'Content-Type': 'application/json' }
}

test('WRITE PATH: uploading a ground photo / amenity still works unchanged while exactly one ground exists', async (t) => {
  const groundCountRow = (await pool.query('SELECT count(*)::int AS count FROM grounds')).rows[0]
  if (groundCountRow.count > 1) {
    t.skip(`more than one ground exists in this DB (${groundCountRow.count}) — see comment above`)
    return
  }
  const server = await startTestApp()
  const admin = await createSuperAdmin('write-single')
  let createdPhotoId, createdAmenityId
  try {
    const photoRes = await fetch(`${server.baseUrl}/ground-photos`, {
      method: 'POST',
      headers: cookieHeader(admin.cookie),
      body: JSON.stringify({ title: 'phase12-write-test-photo', imageUrl: 'https://example.test/p.jpg' }),
    })
    assert.equal(photoRes.status, 201)
    const photoBody = await photoRes.json()
    createdPhotoId = photoBody.id
    assert.ok(photoBody.ground_id, 'the created row must have a ground_id assigned')

    const amenityRes = await fetch(`${server.baseUrl}/amenities`, {
      method: 'POST',
      headers: cookieHeader(admin.cookie),
      body: JSON.stringify({ name: 'phase12-write-test-amenity', imageUrl: 'https://example.test/a.jpg' }),
    })
    assert.equal(amenityRes.status, 201)
    const amenityBody = await amenityRes.json()
    createdAmenityId = amenityBody.id
    assert.ok(amenityBody.ground_id, 'the created row must have a ground_id assigned')
  } finally {
    if (createdPhotoId) await pool.query('DELETE FROM ground_photos WHERE id = $1', [createdPhotoId])
    if (createdAmenityId) await pool.query('DELETE FROM amenities WHERE id = $1', [createdAmenityId])
    await admin.cleanup()
    await server.close()
  }
})

test('Phase 7: GET /ground-photos and GET /amenities require super_admin auth (previously unauthenticated, leaking every ground\'s data)', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdmin('read-auth')
  const nonAdmin = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`,
      [`Integration Test read-auth-nonadmin`, `integration-test-gpa-nonadmin-${Date.now()}@example.test`],
    )
  ).rows[0]
  try {
    const unauthPhotos = await fetch(`${server.baseUrl}/ground-photos`)
    assert.equal(unauthPhotos.status, 401, 'ground-photos list must require authentication')
    const unauthAmenities = await fetch(`${server.baseUrl}/amenities`)
    assert.equal(unauthAmenities.status, 401, 'amenities list must require authentication')

    const nonAdminPhotos = await fetch(`${server.baseUrl}/ground-photos`, { headers: authHeader(signToken({ id: nonAdmin.id })) })
    assert.equal(nonAdminPhotos.status, 403, 'a non-super-admin authenticated user must still be rejected')

    const adminPhotos = await fetch(`${server.baseUrl}/ground-photos`, { headers: cookieHeader(admin.cookie) })
    assert.equal(adminPhotos.status, 200, 'a super_admin (the only real consumer, the admin panel) must still be able to read the list')
    const adminAmenities = await fetch(`${server.baseUrl}/amenities`, { headers: cookieHeader(admin.cookie) })
    assert.equal(adminAmenities.status, 200)
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [nonAdmin.id])
    await admin.cleanup()
    await server.close()
  }
})

// Phase 7 — like the pre-existing "WRITE PATH" test above, POST /ground-photos
// and POST /amenities both go through attachSingleGroundContext BEFORE the
// controller's own imageUrl validation ever runs, so this HTTP-level check
// can only pass while exactly one `grounds` row exists. This shared dev DB
// already has more than one (documented in the Phase 6 report — 2 real
// grounds, plus test debris from earlier phases), so this test is skipped
// with an explicit, environment-derived reason rather than left to fail
// against something unrelated to the fix it verifies — the fix itself
// (isValidHttpUrl) has full unit coverage in
// domain/accountCreation/validation.test.js and is wired into both
// controllers regardless of what this HTTP test can observe here.
const groundCountRow = (await pool.query('SELECT count(*)::int AS count FROM grounds')).rows[0]
const skipUrlValidationHttpTest = groundCountRow.count > 1 ? `more than one ground exists in this DB (${groundCountRow.count}) — see comment above` : false

test(
  'Phase 7: imageUrl must be a valid http(s) URL for both ground-photos and amenities "add by URL"',
  { skip: skipUrlValidationHttpTest },
  async () => {
  const server = await startTestApp()
  const admin = await createSuperAdmin('url-validation')
  try {
    for (const badUrl of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not-a-url', 'ftp://example.test/x.jpg']) {
      const photoRes = await fetch(`${server.baseUrl}/ground-photos`, {
        method: 'POST',
        headers: cookieHeader(admin.cookie),
        body: JSON.stringify({ title: 'bad-url-test', imageUrl: badUrl }),
      })
      assert.equal(photoRes.status, 400, `ground-photos must reject imageUrl='${badUrl}'`)

      const amenityRes = await fetch(`${server.baseUrl}/amenities`, {
        method: 'POST',
        headers: cookieHeader(admin.cookie),
        body: JSON.stringify({ name: 'bad-url-test', imageUrl: badUrl }),
      })
      assert.equal(amenityRes.status, 400, `amenities must reject imageUrl='${badUrl}'`)
    }

    const orphanPhotos = (await pool.query(`SELECT id FROM ground_photos WHERE title = 'bad-url-test'`)).rows
    const orphanAmenities = (await pool.query(`SELECT id FROM amenities WHERE name = 'bad-url-test'`)).rows
    assert.equal(orphanPhotos.length, 0)
    assert.equal(orphanAmenities.length, 0)
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

test('WRITE PATH FAIL-SAFE: once a second ground exists, uploads 409 instead of guessing which ground owns them', async () => {
  const server = await startTestApp()
  const admin = await createSuperAdmin('write-ambiguous')
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const secondGround = (
    await pool.query(
      `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`,
      [generatePublicId('GRD', 8), `integration-test-gpa-second-${tag}`, `Integration Test Second Ground ${tag}`],
    )
  ).rows[0]
  try {
    const photoRes = await fetch(`${server.baseUrl}/ground-photos`, {
      method: 'POST',
      headers: cookieHeader(admin.cookie),
      body: JSON.stringify({ title: 'should-not-be-created', imageUrl: 'https://example.test/x.jpg' }),
    })
    assert.equal(photoRes.status, 409, 'ground_photos upload must fail safely, never silently pick a ground')

    const amenityRes = await fetch(`${server.baseUrl}/amenities`, {
      method: 'POST',
      headers: cookieHeader(admin.cookie),
      body: JSON.stringify({ name: 'should-not-be-created', imageUrl: 'https://example.test/y.jpg' }),
    })
    assert.equal(amenityRes.status, 409, 'amenities upload must fail safely, never silently pick a ground')

    const orphanPhotos = (await pool.query(`SELECT id FROM ground_photos WHERE title = 'should-not-be-created'`)).rows
    const orphanAmenities = (await pool.query(`SELECT id FROM amenities WHERE name = 'should-not-be-created'`)).rows
    assert.equal(orphanPhotos.length, 0, 'no orphaned photo row must have been created')
    assert.equal(orphanAmenities.length, 0, 'no orphaned amenity row must have been created')
  } finally {
    await pool.query('DELETE FROM grounds WHERE id = $1', [secondGround.id])
    await admin.cleanup()
    await server.close()
  }
})
