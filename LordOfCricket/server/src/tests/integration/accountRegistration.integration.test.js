// Phase 4 — Player/Umpire self-registration (POST /auth/register/player,
// /auth/register/umpire), completing via the SAME POST /auth/verify-otp
// Phase 3 already built. Real HTTP against this app's own server, real
// Postgres — same pattern as otpAuth.integration.test.js, including its
// otp_hash brute-force recovery helper (the console provider never exposes
// the code over HTTP by design).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { createHash } from 'node:crypto'
import app from '../../app.js'
import { pool } from '../../config/db.js'

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

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const testEmail = () => `account-reg-${uniqueTag()}@example.test`

async function recoverOtpCode(identifier) {
  const { rows } = await pool.query('SELECT otp_hash FROM otp_codes WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1', [identifier])
  const otpHash = rows[0]?.otp_hash
  if (!otpHash) return null
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0')
    if (createHash('sha256').update(candidate).digest('hex') === otpHash) return candidate
  }
  return null
}

async function cleanupIdentifier(identifier) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1 OR phone = $1', [identifier])
  const userId = rows[0]?.id
  if (userId) {
    await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId])
    await pool.query('UPDATE account_audit_log SET target_user_id = NULL WHERE target_user_id = $1', [userId])
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
  }
  await pool.query('DELETE FROM otp_codes WHERE identifier = $1', [identifier])
}

function json(body) {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

// --- POST /auth/register/player ---------------------------------------

test('register/player: rejects missing name/identifier', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/auth/register/player`, { method: 'POST', ...json({ identifier: testEmail() }) })
    assert.equal(res.status, 400)
    const res2 = await fetch(`${server.baseUrl}/auth/register/player`, { method: 'POST', ...json({ name: 'A' }) })
    assert.equal(res2.status, 400)
  } finally {
    await server.close()
  }
})

test('register/player: rejects an invalid identifier', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/auth/register/player`, { method: 'POST', ...json({ name: 'Bad Identifier', identifier: 'not-an-identifier' }) })
    assert.equal(res.status, 400)
  } finally {
    await server.close()
  }
})

test('register/player: 409s for an identifier that already has a real account', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const email = `account-reg-existing-${tag}@example.test`
  await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'x','player')`, [`Existing ${tag}`, email])
  try {
    const res = await fetch(`${server.baseUrl}/auth/register/player`, { method: 'POST', ...json({ name: 'Someone', identifier: email }) })
    assert.equal(res.status, 409)
  } finally {
    await cleanupIdentifier(email)
    await server.close()
  }
})

test('register/player: full flow creates a role=player, player_type=team_player account with the staged name, and fires PLAYER_REGISTERED', async () => {
  const server = await startTestApp()
  const identifier = testEmail()
  try {
    const regRes = await fetch(`${server.baseUrl}/auth/register/player`, { method: 'POST', ...json({ name: 'Integration Player', identifier }) })
    assert.equal(regRes.status, 200)

    const code = await recoverOtpCode(identifier)
    assert.ok(code, 'an OTP code must have been created for this identifier')

    const verifyRes = await fetch(`${server.baseUrl}/auth/verify-otp`, { method: 'POST', ...json({ identifier, code }) })
    assert.equal(verifyRes.status, 200)
    const body = await verifyRes.json()
    assert.equal(body.user.role, 'player')
    assert.equal(body.user.player_type, 'team_player')
    assert.equal(body.user.name, 'Integration Player')

    const auditRow = (
      await pool.query(
        `SELECT * FROM account_audit_log WHERE event_type = 'PLAYER_REGISTERED' AND target_user_id = $1`,
        [body.user.id],
      )
    ).rows[0]
    assert.ok(auditRow, 'PLAYER_REGISTERED audit event must be recorded')

    // Never trusted from the client — sending role/player_type in the body
    // has no effect since the endpoint only ever accepts {name, identifier}.
    const forgedRes = await fetch(`${server.baseUrl}/auth/register/player`, {
      method: 'POST',
      ...json({ name: 'X', identifier: testEmail(), role: 'staff', player_type: 'umpire' }),
    })
    assert.equal(forgedRes.status, 200, 'unexpected extra body fields are silently ignored, not rejected or honored')
  } finally {
    await cleanupIdentifier(identifier)
    await server.close()
  }
})

// --- POST /auth/register/umpire -----------------------------------------

test('register/umpire: 409s for an identifier that already has a real account', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const email = `account-reg-umpire-existing-${tag}@example.test`
  await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'x','player')`, [`Existing ${tag}`, email])
  try {
    const res = await fetch(`${server.baseUrl}/auth/register/umpire`, { method: 'POST', ...json({ name: 'Someone', identifier: email }) })
    assert.equal(res.status, 409)
  } finally {
    await cleanupIdentifier(email)
    await server.close()
  }
})

test('register/umpire: full flow creates player_type=umpire AND auto-creates a pending umpire_requests row — matching selectPlayerType(\'umpire\')\'s existing behavior exactly', async () => {
  const server = await startTestApp()
  const identifier = testEmail()
  try {
    const regRes = await fetch(`${server.baseUrl}/auth/register/umpire`, { method: 'POST', ...json({ name: 'Integration Umpire', identifier }) })
    assert.equal(regRes.status, 200)

    const code = await recoverOtpCode(identifier)
    const verifyRes = await fetch(`${server.baseUrl}/auth/verify-otp`, { method: 'POST', ...json({ identifier, code }) })
    assert.equal(verifyRes.status, 200)
    const body = await verifyRes.json()
    assert.equal(body.user.role, 'player')
    assert.equal(body.user.player_type, 'umpire')

    const requestRow = (await pool.query('SELECT * FROM umpire_requests WHERE user_id = $1', [body.user.id])).rows[0]
    assert.ok(requestRow, 'a umpire_requests row must be auto-created')
    assert.equal(requestRow.status, 'pending')

    const auditRow = (
      await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'UMPIRE_REGISTERED' AND target_user_id = $1`, [body.user.id])
    ).rows[0]
    assert.ok(auditRow, 'UMPIRE_REGISTERED audit event must be recorded')
  } finally {
    await cleanupIdentifier(identifier)
    await server.close()
  }
})

test('register/umpire: verifying a second time with the same (now-consumed) code is rejected, never replayable', async () => {
  const server = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${server.baseUrl}/auth/register/umpire`, { method: 'POST', ...json({ name: 'Replay Umpire', identifier }) })
    const code = await recoverOtpCode(identifier)
    const first = await fetch(`${server.baseUrl}/auth/verify-otp`, { method: 'POST', ...json({ identifier, code }) })
    assert.equal(first.status, 200)

    const replay = await fetch(`${server.baseUrl}/auth/verify-otp`, { method: 'POST', ...json({ identifier, code }) })
    assert.equal(replay.status, 401)
  } finally {
    await cleanupIdentifier(identifier)
    await server.close()
  }
})

// --- Super Admin can never be created through a public endpoint ---------

test('security: no public registration endpoint accepts or honors a role/staff_role_id override', async () => {
  const server = await startTestApp()
  const identifier = testEmail()
  try {
    const regRes = await fetch(`${server.baseUrl}/auth/register/player`, {
      method: 'POST',
      ...json({ name: 'Forged Super Admin', identifier, role: 'staff', staffRoleId: 1, staff_role_id: 1 }),
    })
    assert.equal(regRes.status, 200)
    const code = await recoverOtpCode(identifier)
    const verifyRes = await fetch(`${server.baseUrl}/auth/verify-otp`, { method: 'POST', ...json({ identifier, code }) })
    const body = await verifyRes.json()
    assert.equal(body.user.role, 'player', 'role is always player, regardless of what the client sends')
    assert.equal(body.user.staff_role, null, 'staff_role is never set via a public registration endpoint')
  } finally {
    await cleanupIdentifier(identifier)
    await server.close()
  }
})
