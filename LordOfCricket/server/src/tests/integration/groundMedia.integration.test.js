// Phase 10 (3D homepage project) — ground_photos/amenities/partners upload
// routes, migrated from local-disk multer storage to Cloudinary. Same real
// HTTP pattern as productionHardening.integration.test.js: a real
// http.createServer(app) on a random port, plain fetch(). No existing
// integration test covered these three routes before this file (grepped
// first, per this project's own "audit before adding" convention).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

// A minimal valid 1x1 PNG, embedded rather than depending on a real file on
// disk — keeps this test self-contained and independent of anything under
// server/uploads/ (which this exact phase is migrating away from).
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

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
  // which a bare JWT can never satisfy (no backing `sessions` row). This
  // file isn't testing MFA, only upload authorization, so a REAL,
  // already-MFA-verified session cookie is minted directly — see
  // helpers/mfaFixtures.js.
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

const ROUTES = [
  { name: 'ground_photos', base: '/ground-photos', field: 'photo', nameField: 'title', urlField: 'image_url' },
  { name: 'amenities', base: '/amenities', field: 'photo', nameField: 'name', urlField: 'image_url' },
  { name: 'partners', base: '/partners', field: 'logo', nameField: 'name', urlField: 'logo_url' },
]

for (const route of ROUTES) {
  test(`${route.name}: upload without auth is rejected (401), never reaches Cloudinary or the DB`, async () => {
    const server = await startTestApp()
    try {
      const form = new FormData()
      form.append(route.field, new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
      const res = await fetch(`${server.baseUrl}${route.base}/upload`, { method: 'POST', body: form })
      assert.equal(res.status, 401)
    } finally {
      await server.close()
    }
  })

  test(`${route.name}: upload as a non-super_admin staff user is rejected (403) — existing RBAC preserved`, async () => {
    const server = await startTestApp()
    const plainStaff = await createPlainStaffUser()
    try {
      const form = new FormData()
      form.append(route.field, new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
      const res = await fetch(`${server.baseUrl}${route.base}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${plainStaff.token}` },
        body: form,
      })
      assert.equal(res.status, 403)
    } finally {
      await plainStaff.cleanup()
      await server.close()
    }
  })

  test(`${route.name}: upload with no file is rejected (400), not a 500`, async () => {
    const server = await startTestApp()
    const admin = await createSuperAdminUser()
    try {
      const form = new FormData()
      form.append(route.nameField, 'Missing file test')
      const res = await fetch(`${server.baseUrl}${route.base}/upload`, {
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

  test(`${route.name}: authorized upload succeeds, stores a real Cloudinary URL + public_id, and cleans up on delete`, async () => {
    const server = await startTestApp()
    const admin = await createSuperAdminUser()
    let createdId = null
    try {
      const form = new FormData()
      form.append(route.field, new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
      form.append(route.nameField, 'Integration Test Upload — safe to delete')

      const uploadRes = await fetch(`${server.baseUrl}${route.base}/upload`, {
        method: 'POST',
        headers: { Cookie: admin.cookie },
        body: form,
      })
      assert.equal(uploadRes.status, 201)
      const body = await uploadRes.json()
      createdId = body.id

      // Database URL persistence — a real Cloudinary secure_url, not a
      // local /uploads/ path.
      assert.match(body[route.urlField], /^https:\/\/res\.cloudinary\.com\//)
      assert.ok(body.cloudinary_public_id, 'cloudinary_public_id must be persisted for later deletion')

      // The URL Cloudinary actually returned must resolve for real.
      const imageRes = await fetch(body[route.urlField])
      assert.equal(imageRes.status, 200)

      // Appears in the list endpoint. ground_photos/amenities now require
      // super_admin auth to list (Phase 7 — see docs/SECURITY.md finding
      // #1); partners' list stays public (platform-wide, not ground-scoped
      // data). Sending the admin cookie on every route in this shared loop
      // is harmless for partners and correct for the other two.
      const listRes = await fetch(`${server.baseUrl}${route.base}`, { headers: { Cookie: admin.cookie } })
      const listBody = await listRes.json()
      const listArr = Array.isArray(listBody) ? listBody : listBody.images
      assert.ok(listArr.some((item) => item.id === createdId))

      // Delete removes the DB row; the row returned confirms which
      // Cloudinary asset was targeted for cleanup.
      const deleteRes = await fetch(`${server.baseUrl}${route.base}/${createdId}`, {
        method: 'DELETE',
        headers: { Cookie: admin.cookie },
      })
      assert.equal(deleteRes.status, 200)
      createdId = null // already deleted, nothing left for the finally block to clean up

      const listAfter = await fetch(`${server.baseUrl}${route.base}`, { headers: { Cookie: admin.cookie } })
      const listAfterBody = await listAfter.json()
      const arrAfter = Array.isArray(listAfterBody) ? listAfterBody : listAfterBody.images
      assert.ok(!arrAfter.some((item) => item.id === body.id))
    } finally {
      if (createdId) await pool.query(`DELETE FROM ${route.name} WHERE id = $1`, [createdId])
      await admin.cleanup()
      await server.close()
    }
  })
}
