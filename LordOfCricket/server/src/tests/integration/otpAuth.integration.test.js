// Phase 3 — unified OTP authentication. Real HTTP against this app's own
// server, real Postgres — same pattern as every other integration test in
// this codebase (http.createServer(app), plain fetch(), no mocking). The
// console OTP provider never exposes the code over HTTP by design, so
// these tests recover it the same way a human tester with real database
// access would: read the stored otp_hash and brute-force the 6-digit
// space (10^6 SHA-256 hashes, milliseconds) — this is not a security
// bypass, it's exactly the "an attacker needs the actual DB plus offline
// compute" threat model hashing is meant to defend against, which is a
// different (and much harder) bar than guessing through the rate-limited
// HTTP endpoint.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { createHash } from 'node:crypto'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import * as otpAuthService from '../../services/otpAuth.service.js'

// This suite must never reach the real Twilio/SendGrid APIs — it asserts
// against `otp_codes.otp_hash`, which Twilio-Verify-delegated rows never
// populate (see twilioProvider.js), and it must not send real SMS/email
// during a normal test run regardless of what real credentials a
// developer's local .env happens to have configured for manual smoke
// testing. Cleared here (after dotenv has already populated process.env via
// app.js's import chain, before any test below issues a request) rather
// than relying on the environment to simply not have them set.
delete process.env.TWILIO_ACCOUNT_SID
delete process.env.TWILIO_API_KEY
delete process.env.TWILIO_API_SECRET
delete process.env.TWILIO_VERIFY_SERVICE_SID
delete process.env.SENDGRID_API_KEY
delete process.env.SENDGRID_FROM_EMAIL

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
const testEmail = () => `otp-integration-${uniqueTag()}@example.test`
const testPhone = () => `+9199${Math.floor(10000000 + Math.random() * 89999999)}`

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
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
  }
  await pool.query('DELETE FROM otp_codes WHERE identifier = $1', [identifier])
}

function extractCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  return setCookie ? setCookie.split(';')[0] : null
}

test('send-otp: valid email returns a generic success message', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    const res = await fetch(`${app_.baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.match(body.message, /code has been sent/i)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('send-otp: malformed identifier is rejected before any OTP is created', async () => {
  const app_ = await startTestApp()
  try {
    const res = await fetch(`${app_.baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'not an email or phone' }),
    })
    assert.equal(res.status, 400)
  } finally {
    await app_.close()
  }
})

test('verify-otp: correct code creates a new user and sets a session cookie', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const code = await recoverOtpCode(identifier)
    assert.ok(code, 'OTP code should have been stored')

    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.email, identifier)
    assert.equal(body.user.status, 'ACTIVE')
    assert.equal(body.user.role, 'user')
    assert.ok(!('password_hash' in body.user), 'password_hash must never be returned')
    assert.ok(extractCookie(res), 'a session cookie must be set on successful verification')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('verify-otp: a second login for the same identifier reuses the same account, never creates a duplicate', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const code1 = await recoverOtpCode(identifier)
    const first = await (await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: code1 }) })).json()

    await pool.query("UPDATE otp_codes SET status = 'EXPIRED' WHERE identifier = $1", [identifier]) // force a fresh cooldown-free request
    const code2 = await (async () => {
      await pool.query('DELETE FROM otp_codes WHERE identifier = $1', [identifier])
      await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
      return recoverOtpCode(identifier)
    })()
    const second = await (await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: code2 }) })).json()

    assert.equal(first.user.id, second.user.id)

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [identifier])
    assert.equal(rows[0].n, 1)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('verify-otp: phone identifier creates a phone-only account with no email', async () => {
  const app_ = await startTestApp()
  const identifier = testPhone()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const code = await recoverOtpCode(identifier)
    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
    const body = await res.json()
    assert.equal(body.user.phone, identifier)
    assert.equal(body.user.email, null)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('verify-otp: wrong code is rejected with a generic message, never revealing why', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: '000000' }) })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_OTP')
    assert.match(body.message, /invalid or expired/i)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('verify-otp: an expired OTP is rejected even with the correct code', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const code = await recoverOtpCode(identifier)
    await pool.query("UPDATE otp_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE identifier = $1", [identifier])

    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'OTP_EXPIRED')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('verify-otp: exceeding max attempts locks the code, even with the correct code afterward', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await fetch(`${app_.baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
    const code = await recoverOtpCode(identifier)

    // 5 wrong attempts (default max_attempts) locks the code
    for (let i = 0; i < 5; i++) {
      await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: '999999' }) })
    }

    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'OTP_LOCKED')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

// Calls the service layer directly rather than the rate-limited HTTP
// endpoint — this test is specifically about otp.service.js's own
// identifier-scoped cooldown logic, not about middlewares/rateLimit.js's
// separate IP-based layer (already covered by
// productionHardening.integration.test.js's rate-limit test). Going
// through HTTP here would make this test's pass/fail depend on how many
// OTP requests every OTHER test in this file happened to make first,
// since otpRequestLimiter is one shared in-memory instance across the
// whole process — exactly the kind of cross-test coupling a unit-level
// call avoids.
test('resend cooldown blocks an immediate second OTP request for the same identifier', async () => {
  const identifier = testEmail()
  try {
    await otpAuthService.requestLoginOtp(identifier)
    await assert.rejects(
      () => otpAuthService.requestLoginOtp(identifier),
      (err) => err.code === 'RESEND_COOLDOWN',
    )
  } finally {
    await cleanupIdentifier(identifier)
  }
})

test('a suspended account cannot complete OTP login even with the correct code', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await otpAuthService.requestLoginOtp(identifier)
    const code1 = await recoverOtpCode(identifier)
    const first = await (await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: code1 }) })).json()
    await pool.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [first.user.id])

    await pool.query('DELETE FROM otp_codes WHERE identifier = $1', [identifier])
    await otpAuthService.requestLoginOtp(identifier)
    const code2 = await recoverOtpCode(identifier)

    const res = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code: code2 }) })
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.code, 'ACCOUNT_NOT_ACTIVE')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('session cookie: /auth/me succeeds while the session is valid, and 401s after logout revokes it', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await otpAuthService.requestLoginOtp(identifier)
    const code = await recoverOtpCode(identifier)
    const verifyRes = await fetch(`${app_.baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
    const cookie = extractCookie(verifyRes)

    const meRes = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(meRes.status, 200)

    const logoutRes = await fetch(`${app_.baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
    assert.equal(logoutRes.status, 200)

    const meAfterLogout = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(meAfterLogout.status, 401)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('/auth/me: no credential at all is rejected', async () => {
  const app_ = await startTestApp()
  try {
    const res = await fetch(`${app_.baseUrl}/auth/me`)
    assert.equal(res.status, 401)
  } finally {
    await app_.close()
  }
})

test('/auth/me: a tampered/garbage session cookie is rejected, not silently ignored', async () => {
  const app_ = await startTestApp()
  try {
    const res = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: 'loc_session=garbage-not-a-real-token' } })
    assert.equal(res.status, 401)
  } finally {
    await app_.close()
  }
})

test('regression: the legacy JWT bearer path still authenticates an existing user unchanged', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    // Create a user the legacy way (direct insert, matching auth.controller.js#signup's shape) —
    // this test is specifically about the OLD credential still working, not about OTP at all.
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', 'player') RETURNING id`,
      ['Legacy Test User', identifier],
    )
    const userId = rows[0].id
    const legacyToken = signToken({ id: userId })

    const res = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${legacyToken}` } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.user.id, userId)
    assert.equal(body.user.status, 'ACTIVE') // backfilled default, unaffected by legacy path
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})
