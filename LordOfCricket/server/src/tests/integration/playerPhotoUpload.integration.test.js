// Choose-from-device profile photo upload (POST /api/me/player/photo),
// replacing the old plain-text "Profile Photo URL" field. Real HTTP pattern
// matching every other integration test in this codebase: http.createServer
// (app) on a random port, plain fetch(), no mocking of the database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../../utils/cloudinaryUpload.js'

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

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

// Cloudinary preflight (Phase 1's report) — this sandbox's Cloudinary
// credentials don't permit real uploads, so the one test that needs a real
// upload to succeed skips with a clear reason instead of failing.
let cloudinaryUploadWorks = false
let preflightSkipReason = 'Cloudinary preflight upload did not run'
try {
  const probe = await uploadImageFileDetailed({ buffer: ONE_PX_PNG, originalname: 'preflight.png', mimetype: 'image/png' }, 'player-photo-test-preflight')
  cloudinaryUploadWorks = true
  await deleteImageByPublicId(probe.publicId)
} catch (err) {
  preflightSkipReason = `Cloudinary upload is not permitted in this environment (${err.message}) — not a regression, see Phase 1/3 reports`
}

async function createPlayerUser(label) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`,
      [`Integration Test ${label}`, `integration-test-photo-${label}-${tag}@example.test`],
    )
  ).rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM players WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

test('no auth -> 401', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/me/player/photo`, { method: 'POST' })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('no file -> 400, not a 500', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('no-file')
  try {
    const res = await fetch(`${server.baseUrl}/me/player/photo`, { method: 'POST', headers: authHeader(user.token) })
    assert.equal(res.status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test('a disallowed file type is rejected with 400', async () => {
  const server = await startTestApp()
  const user = await createPlayerUser('bad-type')
  try {
    const form = new FormData()
    form.append('photo', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'notes.txt')
    const res = await fetch(`${server.baseUrl}/me/player/photo`, { method: 'POST', headers: authHeader(user.token), body: form })
    assert.equal(res.status, 400)
  } finally {
    await user.cleanup()
    await server.close()
  }
})

test(
  'a real uploaded file stores a real Cloudinary URL and persists it as the player\'s photo_url, creating a player row if none existed yet',
  { skip: !cloudinaryUploadWorks && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    const user = await createPlayerUser('real-upload')
    try {
      const before = (await pool.query('SELECT id FROM players WHERE user_id = $1', [user.id])).rows[0]
      assert.equal(before, undefined, 'no player row should exist yet for this fresh user')

      const form = new FormData()
      form.append('photo', new Blob([ONE_PX_PNG], { type: 'image/png' }), 'test.png')
      const res = await fetch(`${server.baseUrl}/me/player/photo`, { method: 'POST', headers: authHeader(user.token), body: form })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.match(body.player.photo_url, /^https:\/\/res\.cloudinary\.com\//)

      const persisted = (await pool.query('SELECT photo_url FROM players WHERE user_id = $1', [user.id])).rows[0]
      assert.equal(persisted.photo_url, body.player.photo_url, 'the response must reflect what was actually persisted')
    } finally {
      await user.cleanup()
      await server.close()
    }
  },
)
