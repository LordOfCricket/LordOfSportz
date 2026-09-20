// Phase 18.2/18.3 — Observability & launch readiness. Verifies liveness/
// readiness correctly distinguish "process is up" from "can actually serve
// requests," never leak sensitive infrastructure details, and that the
// global error handler's predictable, code-based error format (already
// established — see middlewares/errorHandler.js) never leaks a stack trace
// or raw driver/database error to a client response.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { generatePublicId } from '../../utils/publicId.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = { emit: () => {}, to: () => ({ emit: () => {} }) }
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

test('GET /health — liveness never touches the database, always 200', async (t) => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/health`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.status, 'ok')
    // Liveness must never leak DB host/credentials/internal config.
    assert.ok(!('postgres' in data) && !('database' in data))
  } finally {
    await server.close()
  }
})

test('GET /health/ready — readiness reports a real Postgres check, no sensitive details leaked', async (t) => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/health/ready`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.status, 'ready')
    assert.strictEqual(data.postgres, 'connected')
    // Optional-service flags are boolean-ish state ("configured"/"not_configured"),
    // never the actual key/URL.
    const raw = JSON.stringify(data)
    assert.ok(!raw.includes('postgresql://'), 'must never leak a DB connection string')
    assert.ok(typeof data.optional === 'object')
    for (const value of Object.values(data.optional)) {
      assert.ok(['configured', 'not_configured'].includes(value), 'optional-service state must be a fixed enum value, never a raw key/URL')
    }
  } finally {
    await server.close()
  }
})

test('a structured domain error (Phase 17 GROUND_CLOSED) returns {code, message}, never a stack trace or raw driver error', async (t) => {
  const server = await startTestApp()
  try {
    const owner = (
      await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'x','player') RETURNING *`, [
        'Health Test Owner',
        `health-owner-${Math.random().toString(36).slice(2)}@example.test`,
      ])
    ).rows[0]
    const { cookie } = await mintMfaVerifiedSessionCookie(owner.id)
    const ground = (
      await pool.query(
        `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1,$2,$3,$4,'SUSPENDED') RETURNING *`,
        [generatePublicId('GRD', 8), `health-ground-${Math.random().toString(36).slice(2)}`, 'Health Test Ground', 'x'],
      )
    ).rows[0]
    await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_OWNER',true)`, [owner.id, ground.id])

    const dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/bookings/staff-blocks`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, hour: 8, purpose: 'Test' }),
    })
    const raw = await res.text()
    const body = JSON.parse(raw)

    assert.strictEqual(res.status, 409)
    assert.strictEqual(body.code, 'GROUND_CLOSED')
    assert.ok(typeof body.message === 'string' && body.message.length > 0)
    // Never a stack trace, file path, or raw Postgres/driver error text.
    assert.ok(!raw.includes('node_modules'))
    assert.ok(!raw.toLowerCase().includes('at object.') && !raw.toLowerCase().includes('    at '))
    assert.ok(!raw.toLowerCase().includes('postgreserror'))

    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await pool.query('DELETE FROM users WHERE id = $1', [owner.id])
  } finally {
    await server.close()
  }
})

test('an unknown route returns a clean 404, never a stack trace', async (t) => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/this-route-does-not-exist-${Math.random().toString(36).slice(2)}`)
    assert.strictEqual(res.status, 404)
    const raw = await res.text()
    assert.ok(!raw.includes('node_modules'))
    assert.ok(!raw.toLowerCase().includes('    at '))
  } finally {
    await server.close()
  }
})
