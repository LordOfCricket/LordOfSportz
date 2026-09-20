// Auth Enhancement — password login + forgot-password. Real HTTP against
// this app's own server, real Postgres, real bcrypt hashing — same pattern
// as otpAuth.integration.test.js (http.createServer(app), plain fetch(),
// no mocking).
//
// Hermetic by construction, same reasoning as otpAuth.integration.test.js's
// own guard: TWILIO_*/SENDGRID_* are cleared below so forgot-password's OTP
// send (which otherwise resolves to real Twilio, now that real credentials
// exist in this developer's .env — see the Twilio integration task) always
// goes through the console provider in this suite, and recoverOtpCode below
// (reading otp_hash from Postgres) stays valid for every identifier tested
// here regardless of what's configured for manual smoke testing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import app from '../../app.js'
import { pool } from '../../config/db.js'

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
const testEmail = () => `password-auth-integration-${uniqueTag()}@example.test`
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
    await pool.query('DELETE FROM account_audit_log WHERE target_user_id = $1', [userId])
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

const KNOWN_PASSWORD = 'correct-horse-battery-staple'

// Creates a user with a REAL bcrypt hash (same cost factor the app itself
// uses — staffAccount.service.js#createPlatformStaff's existing convention)
// directly via SQL, mirroring how otpAuth.integration.test.js's own fixture
// helpers skip the HTTP signup ceremony for unrelated-functionality setup.
async function createUserWithPassword(identifier, identifierType, { password = KNOWN_PASSWORD, status = 'ACTIVE', role = 'user' } = {}) {
  const passwordHash = await bcrypt.hash(password, 10)
  const column = identifierType === 'PHONE' ? 'phone' : 'email'
  const { rows } = await pool.query(
    `INSERT INTO users (name, ${column}, password_hash, role, status) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Integration Test Password User', identifier, passwordHash, role, status],
  )
  return rows[0].id
}

// ---------------------------------------------------------------------------
// Password login
// ---------------------------------------------------------------------------

test('login-password: correct email + password creates a session (same shape as OTP login)', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    assert.equal(res.status, 200)
    const cookie = extractCookie(res)
    assert.match(cookie, /^loc_session=/)
    const body = await res.json()
    assert.equal(body.user.email, identifier)
    assert.equal(body.user.password_hash, undefined) // never returned

    const me = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(me.status, 200)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: correct phone + password creates a session', async () => {
  const app_ = await startTestApp()
  const identifier = testPhone()
  try {
    await createUserWithPassword(identifier, 'PHONE')
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    assert.equal(res.status, 200)
    assert.match(extractCookie(res), /^loc_session=/)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: wrong password is rejected with a generic message, never revealing why', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: 'totally-wrong-password' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_CREDENTIALS')
    assert.equal(extractCookie(res), null)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: user enumeration protection — nonexistent identifier and wrong password get the BYTE-IDENTICAL response', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    const wrongPassword = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: 'wrong' }),
    })
    const noSuchAccount = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testEmail(), password: 'wrong' }),
    })
    assert.equal(wrongPassword.status, noSuchAccount.status)
    const [bodyA, bodyB] = await Promise.all([wrongPassword.json(), noSuchAccount.json()])
    // FINAL AUDIT — Phase 21.2 added a per-request `requestId` to every
    // error response (for incident-log correlation); it's expected to
    // differ between any two distinct requests by design and reveals
    // nothing about account existence (it's the same random shape
    // regardless of outcome), so it's excluded from the byte-identical
    // comparison this test actually cares about — everything else (the
    // part an attacker could actually observe to enumerate accounts) must
    // still be identical.
    const { requestId: requestIdA, ...restA } = bodyA
    const { requestId: requestIdB, ...restB } = bodyB
    assert.deepEqual(restA, restB)
    assert.ok(requestIdA && requestIdB, 'both responses must still carry a requestId')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: an account with no password set (OTP-only account) cannot be logged into with any password', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await pool.query(`INSERT INTO users (name, email, password_hash, role, status) VALUES ($1,$2,NULL,'user','ACTIVE')`, [
      'Integration Test OTP-Only User',
      identifier,
    ])
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: 'anything' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_CREDENTIALS')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: a suspended account cannot log in even with the correct password', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL', { status: 'SUSPENDED' })
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.code, 'ACCOUNT_NOT_ACTIVE')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('login-password: the response body never contains a password_hash field', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    const res = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    const text = await res.text()
    assert.equal(/password_hash/i.test(text), false)
    assert.equal(text.includes(KNOWN_PASSWORD), false)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

test('forgot-password + reset-password: full lifecycle — request, verify, set new password, log in with it, old password stops working', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')

    const forgotRes = await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    assert.equal(forgotRes.status, 200)

    const code = await recoverOtpCode(identifier)
    assert.ok(code)

    const newPassword = 'a-brand-new-password-123'
    const resetRes = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword, confirmPassword: newPassword }),
    })
    assert.equal(resetRes.status, 200)

    // Old password no longer works.
    const oldLogin = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    assert.equal(oldLogin.status, 401)

    // New password works.
    const newLogin = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: newPassword }),
    })
    assert.equal(newLogin.status, 200)
    assert.match(extractCookie(newLogin), /^loc_session=/)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: wrong code is rejected with the same generic message as OTP login', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const res = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code: '000000', newPassword: 'whatever12345', confirmPassword: 'whatever12345' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_OTP')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: an expired code is rejected even with the correct code', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)
    await pool.query("UPDATE otp_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE identifier = $1", [identifier])

    const res = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'whatever12345', confirmPassword: 'whatever12345' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'OTP_EXPIRED')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: a code cannot be reused after a successful reset', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)

    const first = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'first-new-password-1', confirmPassword: 'first-new-password-1' }),
    })
    assert.equal(first.status, 200)

    const replay = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'second-new-password-2', confirmPassword: 'second-new-password-2' }),
    })
    assert.equal(replay.status, 401)
    const body = await replay.json()
    assert.equal(body.code, 'INVALID_OTP')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: a valid LOGIN-purpose code cannot satisfy a password reset (purpose is checked, not just validity)', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    // Request a LOGIN otp, not a PASSWORD_RESET one.
    await fetch(`${app_.baseUrl}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const loginCode = await recoverOtpCode(identifier)

    const res = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code: loginCode, newPassword: 'whatever12345', confirmPassword: 'whatever12345' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_OTP')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: mismatched password confirmation is rejected before the OTP is even consumed', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)

    const mismatchRes = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'password-one-12345', confirmPassword: 'password-two-67890' }),
    })
    assert.equal(mismatchRes.status, 400)
    const mismatchBody = await mismatchRes.json()
    assert.equal(mismatchBody.code, 'PASSWORD_MISMATCH')

    // The code must still be valid — proves the mismatch check ran BEFORE verifyOtp consumed it.
    const retryRes = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'password-one-12345', confirmPassword: 'password-one-12345' }),
    })
    assert.equal(retryRes.status, 200)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: a too-short new password is rejected by the password policy', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)

    const res = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'short', confirmPassword: 'short' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'PASSWORD_POLICY_VIOLATION')
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: verified code but no account for that identifier is rejected generically, never creates an account', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail() // no user created for this identifier
  try {
    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)
    assert.ok(code)

    const res = await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'whatever12345', confirmPassword: 'whatever12345' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'INVALID_OTP')

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [identifier])
    assert.equal(rows.length, 0) // never auto-created, unlike LOGIN purpose's find-or-create
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})

test('reset-password: existing sessions for the user are invalidated, but a DIFFERENT user\'s sessions are untouched', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  const otherIdentifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    await createUserWithPassword(otherIdentifier, 'EMAIL')

    const loginRes = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: KNOWN_PASSWORD }),
    })
    const ownCookie = extractCookie(loginRes)

    const otherLoginRes = await fetch(`${app_.baseUrl}/auth/login-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: otherIdentifier, password: KNOWN_PASSWORD }),
    })
    const otherCookie = extractCookie(otherLoginRes)

    await fetch(`${app_.baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })
    const code = await recoverOtpCode(identifier)
    await fetch(`${app_.baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code, newPassword: 'post-reset-password-1', confirmPassword: 'post-reset-password-1' }),
    })

    const meOwn = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: ownCookie } })
    assert.equal(meOwn.status, 401) // this user's old session is dead

    const meOther = await fetch(`${app_.baseUrl}/auth/me`, { headers: { Cookie: otherCookie } })
    assert.equal(meOther.status, 200) // the OTHER user's session must survive
  } finally {
    await cleanupIdentifier(identifier)
    await cleanupIdentifier(otherIdentifier)
    await app_.close()
  }
})

// ---------------------------------------------------------------------------
// Rate limiting — deliberately the LAST test in this file. express-rate-
// limit's in-memory store (this app's documented single-instance posture,
// see rateLimit.js's own header) is shared for the lifetime of this test
// process, not reset between individual test() blocks — every other test
// above that calls /auth/login-password consumes a little of the SAME
// IP-keyed passwordLoginLimiter quota. Running this one first would exhaust
// that shared quota early and 429 every legitimate login attempt in every
// test that runs after it (caught exactly this way while writing this
// suite — see git history). Placed last, it only needs to guarantee it
// eventually trips 429, which it will regardless of how much quota earlier
// tests already used.
// ---------------------------------------------------------------------------

test('login-password: rate limiting blocks repeated attempts against the same identifier', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail()
  try {
    await createUserWithPassword(identifier, 'EMAIL')
    let last
    for (let i = 0; i < 11; i++) {
      last = await fetch(`${app_.baseUrl}/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password: 'wrong-every-time' }),
      })
    }
    assert.equal(last.status, 429)
  } finally {
    await cleanupIdentifier(identifier)
    await app_.close()
  }
})
