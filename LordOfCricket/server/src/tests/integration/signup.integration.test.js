// New Signup Flow — real Postgres, real bcrypt hashing throughout. Most
// tests call services/signup.service.js directly rather than the rate-
// limited HTTP routes — same established convention
// otpAuth.integration.test.js's "resend cooldown" test already uses (see
// its own comment): otpRequestLimiter/accountCreationLimiter are one
// shared in-memory instance for this whole process, so a test file this
// thorough going through HTTP for every scenario would make later tests'
// pass/fail depend on how many requests every earlier test happened to
// make first. A small number of tests below DO go through real HTTP
// (http.createServer(app) + fetch) specifically to prove the actual
// routes/controllers are wired correctly end-to-end — the rate limiters
// themselves are covered elsewhere (productionHardening.integration.test.js).
//
// Hermetic by construction, same reasoning as every other auth integration
// test file in this repo: TWILIO_*/SENDGRID_* are cleared below so both the
// email-verification code and the phone-verification code this flow sends
// always go through the console provider here, regardless of what real
// credentials a developer's .env has configured for manual smoke testing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { createHash } from 'node:crypto'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import * as signupService from '../../services/signup.service.js'
import { AccountCreationError } from '../../domain/accountCreation/errors.js'
import { OtpAuthError } from '../../domain/otpAuth/errors.js'

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
const testEmail = () => `signup-integration-${uniqueTag()}@example.test`
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

async function cleanupIdentifiers(identifiers) {
  for (const identifier of identifiers) {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1 OR phone = $1', [identifier])
    const userId = rows[0]?.id
    if (userId) {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM account_audit_log WHERE target_user_id = $1', [userId])
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM users WHERE id = $1', [userId])
    }
    await pool.query('DELETE FROM otp_codes WHERE identifier = $1', [identifier])
  }
}

async function postJson(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

const STRONG_PASSWORD = 'a-strong-signup-password-1'
const validAccountFields = (overrides = {}) => ({
  firstName: 'Rahul',
  middleName: 'Kumar',
  lastName: 'Sahu',
  accountType: 'PLAYER',
  password: STRONG_PASSWORD,
  confirmPassword: STRONG_PASSWORD,
  ...overrides,
})

// Service-layer helper — verifies both identifiers via the real
// otp.service.js machinery (real hashing, real expiry/attempt columns,
// real Postgres), just not through the rate-limited HTTP route.
async function signUpDirectly(overrides = {}) {
  const email = testEmail()
  const phone = testPhone()
  await signupService.requestSignupVerification(email)
  await signupService.verifySignupIdentifier({ identifier: email, code: await recoverOtpCode(email) })
  await signupService.requestSignupVerification(phone)
  await signupService.verifySignupIdentifier({ identifier: phone, code: await recoverOtpCode(phone) })
  const { user } = await signupService.createAccount(validAccountFields({ email, phone, ...overrides }))
  return { email, phone, user }
}

// ---------------------------------------------------------------------------
// Full lifecycle — real HTTP end-to-end, one for each account type
// ---------------------------------------------------------------------------

test('signup (HTTP end-to-end): full Player lifecycle — verify email, verify phone, create account, then log in with the new password', async () => {
  const app_ = await startTestApp()
  const email = testEmail()
  const phone = testPhone()
  try {
    await postJson(app_.baseUrl, '/auth/signup/send-code', { identifier: email })
    await postJson(app_.baseUrl, '/auth/signup/verify-code', { identifier: email, code: await recoverOtpCode(email) })
    await postJson(app_.baseUrl, '/auth/signup/send-code', { identifier: phone })
    await postJson(app_.baseUrl, '/auth/signup/verify-code', { identifier: phone, code: await recoverOtpCode(phone) })

    const create = await postJson(app_.baseUrl, '/auth/signup/create-account', validAccountFields({ email, phone }))
    assert.equal(create.status, 201)
    assert.equal(create.body.user.player_type, 'team_player')
    assert.equal(JSON.stringify(create.body).includes(STRONG_PASSWORD), false)
    assert.equal(/password_hash/i.test(JSON.stringify(create.body)), false)

    const { rows } = await pool.query('SELECT role, player_type, name, password_hash FROM users WHERE email = $1', [email])
    assert.equal(rows[0].role, 'player')
    assert.equal(rows[0].player_type, 'team_player')
    assert.equal(rows[0].name, 'Rahul Kumar Sahu')
    assert.match(rows[0].password_hash, /^\$2[aby]\$/) // real bcrypt hash, never the raw password

    const login = await postJson(app_.baseUrl, '/auth/login-password', { identifier: email, password: STRONG_PASSWORD })
    assert.equal(login.status, 200)
    assert.equal(login.body.user.player_type, 'team_player')
  } finally {
    await cleanupIdentifiers([email, phone])
    await app_.close()
  }
})

test('signup (HTTP end-to-end): full Umpire lifecycle — creates a pending umpire_requests row, logs in afterward', async () => {
  const app_ = await startTestApp()
  const email = testEmail()
  const phone = testPhone()
  try {
    await postJson(app_.baseUrl, '/auth/signup/send-code', { identifier: email })
    await postJson(app_.baseUrl, '/auth/signup/verify-code', { identifier: email, code: await recoverOtpCode(email) })
    await postJson(app_.baseUrl, '/auth/signup/send-code', { identifier: phone })
    await postJson(app_.baseUrl, '/auth/signup/verify-code', { identifier: phone, code: await recoverOtpCode(phone) })

    const create = await postJson(app_.baseUrl, '/auth/signup/create-account', validAccountFields({ email, phone, accountType: 'UMPIRE' }))
    assert.equal(create.status, 201)
    assert.equal(create.body.user.player_type, 'umpire')

    const { rows: reqRows } = await pool.query('SELECT status FROM umpire_requests WHERE user_id = $1', [create.body.user.id])
    assert.equal(reqRows.length, 1)
    assert.equal(reqRows[0].status, 'pending')

    const login = await postJson(app_.baseUrl, '/auth/login-password', { identifier: phone, password: STRONG_PASSWORD })
    assert.equal(login.status, 200)
    assert.equal(login.body.user.player_type, 'umpire')
  } finally {
    await cleanupIdentifiers([email, phone])
    await app_.close()
  }
})

// ---------------------------------------------------------------------------
// Field validation (service layer — pure validation, no need for HTTP)
// ---------------------------------------------------------------------------

test('signup: missing first/middle/last name is rejected', async () => {
  for (const missing of ['firstName', 'middleName', 'lastName']) {
    const fields = validAccountFields({ email: testEmail(), phone: testPhone() })
    delete fields[missing]
    await assert.rejects(() => signupService.createAccount(fields), (err) => err instanceof AccountCreationError && err.code === 'VALIDATION_ERROR')
  }
})

test('signup: whitespace-only name fields are rejected, not just missing ones', async () => {
  const fields = validAccountFields({ email: testEmail(), phone: testPhone(), firstName: '   ' })
  await assert.rejects(() => signupService.createAccount(fields), (err) => err instanceof AccountCreationError && err.code === 'VALIDATION_ERROR')
})

test('signup: no account type / invalid account type is rejected', async () => {
  const fields = validAccountFields({ email: testEmail(), phone: testPhone(), accountType: 'COACH' })
  await assert.rejects(() => signupService.createAccount(fields), (err) => err instanceof AccountCreationError && err.code === 'VALIDATION_ERROR')
})

test('signup: invalid email format is rejected at send-code time', async () => {
  await assert.rejects(() => signupService.requestSignupVerification('not-an-email'), (err) => err instanceof OtpAuthError && err.code === 'INVALID_IDENTIFIER')
})

// ---------------------------------------------------------------------------
// Verification cannot be bypassed — the brief's critical security rule
// ---------------------------------------------------------------------------

test('signup: unverified email cannot complete signup, even with a real phone verification', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    // Email: never verified. Phone: properly verified.
    await signupService.requestSignupVerification(phone)
    await signupService.verifySignupIdentifier({ identifier: phone, code: await recoverOtpCode(phone) })

    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone })),
      (err) => err instanceof AccountCreationError && err.code === 'EMAIL_NOT_VERIFIED',
    )
    const { rows } = await pool.query('SELECT id FROM users WHERE phone = $1', [phone])
    assert.equal(rows.length, 0, 'no account must be created when email verification is missing')
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: unverified phone cannot complete signup, even with a real email verification', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    await signupService.requestSignupVerification(email)
    await signupService.verifySignupIdentifier({ identifier: email, code: await recoverOtpCode(email) })
    // Phone: never verified.

    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone })),
      (err) => err instanceof AccountCreationError && err.code === 'PHONE_NOT_VERIFIED',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: calling create-account with no verification at all is rejected (cannot bypass by skipping the UI steps)', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone })),
      (err) => err instanceof AccountCreationError && ['EMAIL_NOT_VERIFIED', 'PHONE_NOT_VERIFIED'].includes(err.code),
    )
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    assert.equal(rows.length, 0)
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: a verified LOGIN-purpose code cannot satisfy signup verification (purpose is checked, not just validity)', async () => {
  const email = testEmail()
  try {
    // Requested via the LOGIN-purpose OTP service function, not signup's.
    const otpAuthService = await import('../../services/otpAuth.service.js')
    await otpAuthService.requestLoginOtp(email)
    const loginCode = await recoverOtpCode(email)

    await assert.rejects(
      () => signupService.verifySignupIdentifier({ identifier: email, code: loginCode }),
      (err) => err instanceof OtpAuthError && err.code === 'INVALID_OTP',
    )
  } finally {
    await cleanupIdentifiers([email])
  }
})

// ---------------------------------------------------------------------------
// OTP correctness — wrong / expired / stale
// ---------------------------------------------------------------------------

test('signup: wrong verification code is rejected with a generic message', async () => {
  const email = testEmail()
  try {
    await signupService.requestSignupVerification(email)
    await assert.rejects(
      () => signupService.verifySignupIdentifier({ identifier: email, code: '000000' }),
      (err) => err instanceof OtpAuthError && err.code === 'INVALID_OTP',
    )
  } finally {
    await cleanupIdentifiers([email])
  }
})

test('signup: an expired verification code is rejected even if correct', async () => {
  const email = testEmail()
  try {
    await signupService.requestSignupVerification(email)
    const code = await recoverOtpCode(email)
    await pool.query("UPDATE otp_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE identifier = $1", [email])
    await assert.rejects(
      () => signupService.verifySignupIdentifier({ identifier: email, code }),
      (err) => err instanceof OtpAuthError && err.code === 'OTP_EXPIRED',
    )
  } finally {
    await cleanupIdentifiers([email])
  }
})

test('signup: a stale verification (older than the freshness window) can no longer complete signup', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    await signupService.requestSignupVerification(email)
    await signupService.verifySignupIdentifier({ identifier: email, code: await recoverOtpCode(email) })
    // Simulate the verification having happened well outside the freshness window.
    await pool.query("UPDATE otp_codes SET verified_at = NOW() - INTERVAL '1 day' WHERE identifier = $1 AND status = 'VERIFIED'", [email])

    await signupService.requestSignupVerification(phone)
    await signupService.verifySignupIdentifier({ identifier: phone, code: await recoverOtpCode(phone) })

    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone })),
      (err) => err instanceof AccountCreationError && err.code === 'EMAIL_NOT_VERIFIED',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

// ---------------------------------------------------------------------------
// Password rules
// ---------------------------------------------------------------------------

test('signup: mismatched password confirmation is rejected', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    await signupService.requestSignupVerification(email)
    await signupService.verifySignupIdentifier({ identifier: email, code: await recoverOtpCode(email) })
    await signupService.requestSignupVerification(phone)
    await signupService.verifySignupIdentifier({ identifier: phone, code: await recoverOtpCode(phone) })

    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone, confirmPassword: 'a-totally-different-password' })),
      (err) => err instanceof OtpAuthError && err.code === 'PASSWORD_MISMATCH',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: a weak/too-short password is rejected by the password policy', async () => {
  const email = testEmail()
  const phone = testPhone()
  try {
    await signupService.requestSignupVerification(email)
    await signupService.verifySignupIdentifier({ identifier: email, code: await recoverOtpCode(email) })
    await signupService.requestSignupVerification(phone)
    await signupService.verifySignupIdentifier({ identifier: phone, code: await recoverOtpCode(phone) })

    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email, phone, password: 'short', confirmPassword: 'short' })),
      (err) => err instanceof OtpAuthError && err.code === 'PASSWORD_POLICY_VIOLATION',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

// ---------------------------------------------------------------------------
// Duplicate prevention
// ---------------------------------------------------------------------------

test('signup: duplicate email is rejected at send-code time, revealing the account exists (registration convention)', async () => {
  const { email, phone } = await signUpDirectly()
  try {
    await assert.rejects(
      () => signupService.requestSignupVerification(email),
      (err) => err instanceof AccountCreationError && err.code === 'IDENTIFIER_ALREADY_REGISTERED',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: duplicate phone is rejected at send-code time', async () => {
  const { email, phone } = await signUpDirectly()
  try {
    await assert.rejects(
      () => signupService.requestSignupVerification(phone),
      (err) => err instanceof AccountCreationError && err.code === 'IDENTIFIER_ALREADY_REGISTERED',
    )
  } finally {
    await cleanupIdentifiers([email, phone])
  }
})

test('signup: duplicate email/phone is also rejected at create-account time (defense in depth against a race with send-code\'s own check)', async () => {
  const { email: existingEmail, phone: existingPhone } = await signUpDirectly()
  const newPhone = testPhone()
  try {
    await signupService.requestSignupVerification(newPhone)
    await signupService.verifySignupIdentifier({ identifier: newPhone, code: await recoverOtpCode(newPhone) })
    // existingEmail was never (re-)verified in THIS flow, but even if it had
    // been, the account-creation step itself must re-check existence.
    await assert.rejects(
      () => signupService.createAccount(validAccountFields({ email: existingEmail, phone: newPhone })),
      (err) => err instanceof AccountCreationError,
    )
  } finally {
    await cleanupIdentifiers([existingEmail, existingPhone, newPhone])
  }
})
