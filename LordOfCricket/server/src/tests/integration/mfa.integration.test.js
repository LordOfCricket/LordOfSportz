// Phase 6 — MFA factor lifecycle, baseline verification, and the
// bootstrap-vs-step-up rule. Real HTTP against this app's own server, real
// Postgres — same pattern as otpAuth.integration.test.js. TOTP is used
// throughout (not WebAuthn): a real WebAuthn ceremony needs browser-native
// crypto/attestation that plain HTTP/fetch cannot produce; that ceremony is
// covered separately via a Playwright CDP virtual authenticator once the
// frontend UI exists (see docs/MFA.md "Known limitations"). The pure
// WebAuthn counter-rollback guard itself IS unit-tested
// (domain/mfa/counterRollback.test.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { signToken } from '../../utils/jwt.js'
import { pool } from '../../config/db.js'
import app from '../../app.js'
import {
  loginViaOtp,
  enrollAndActivateTotp,
  verifyBaselineMfaTotp,
  nextTotpCode,
} from './helpers/mfaFixtures.js'

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
const testEmail = (label) => `mfa-integration-${label}-${uniqueTag()}@example.test`

async function cleanupUser(userId) {
  if (!userId) return
  await pool.query('DELETE FROM step_up_grants WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM totp_credentials WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM webauthn_credentials WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM webauthn_challenges WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM account_audit_log WHERE actor_user_id = $1 OR target_user_id = $1', [userId])
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM otp_codes WHERE user_id = $1', [userId])
  await pool.query('DELETE FROM users WHERE id = $1', [userId])
}

test('bootstrap: enrolling the FIRST TOTP factor succeeds with no prior step-up grant', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('bootstrap')
  let userId
  try {
    const login = await loginViaOtp(app_.baseUrl, identifier)
    userId = login.userId

    const enrollRes = await fetch(`${app_.baseUrl}/auth/mfa/totp/enroll`, { method: 'POST', headers: { Cookie: login.cookie } })
    assert.equal(enrollRes.status, 200)
    const { qrDataUrl } = await enrollRes.json()
    assert.match(qrDataUrl, /^data:image\/png;base64,/)

    const { rows } = await pool.query('SELECT encrypted_secret FROM totp_credentials WHERE user_id = $1', [userId])
    const { decryptSecret } = await import('../../services/totp.service.js')
    const secret = decryptSecret(rows[0].encrypted_secret)
    const { code } = await nextTotpCode(secret)

    const verifyRes = await fetch(`${app_.baseUrl}/auth/mfa/totp/verify`, {
      method: 'POST',
      headers: { Cookie: login.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    assert.equal(verifyRes.status, 200, 'bootstrap enrollment must never require STEP_UP_REQUIRED')

    const auditRow = await pool.query(
      `SELECT 1 FROM account_audit_log WHERE event_type = 'MFA_ENROLLMENT_COMPLETED' AND actor_user_id = $1`,
      [userId],
    )
    assert.equal(auditRow.rows.length, 1)
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})

test('last-factor removal is blocked even WITH a fresh step-up grant (TOTP-only account)', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('last-factor')
  let userId
  try {
    const login = await loginViaOtp(app_.baseUrl, identifier)
    userId = login.userId
    const { secret, lastStep } = await enrollAndActivateTotp(app_.baseUrl, login.cookie, userId)

    // Baseline-verify first (also consumes a fresh TOTP code) so a step-up
    // challenge can be requested against an activated factor.
    const baseline = await verifyBaselineMfaTotp(app_.baseUrl, login.cookie, secret, lastStep)
    assert.equal(baseline.res.status, 200)

    const { code: stepUpCode } = await nextTotpCode(secret, baseline.step)
    const stepUpVerify = await fetch(`${app_.baseUrl}/auth/step-up/verify`, {
      method: 'POST',
      headers: { Cookie: login.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionScope: 'TOTP_DISABLE', method: 'totp', code: stepUpCode }),
    })
    assert.equal(stepUpVerify.status, 200)

    const disableRes = await fetch(`${app_.baseUrl}/auth/mfa/totp/disable`, { method: 'POST', headers: { Cookie: login.cookie } })
    assert.equal(disableRes.status, 409)
    const body = await disableRes.json()
    assert.equal(body.code, 'LAST_FACTOR_REMOVAL_BLOCKED')

    const stillActive = await pool.query('SELECT 1 FROM totp_credentials WHERE user_id = $1 AND disabled_at IS NULL', [userId])
    assert.equal(stillActive.rows.length, 1, 'the factor must still be active after the blocked attempt')
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})

test('baseline MFA verify: a wrong TOTP code is rejected with a generic VERIFICATION_FAILED', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('baseline-wrong')
  let userId
  try {
    const login = await loginViaOtp(app_.baseUrl, identifier)
    userId = login.userId
    await enrollAndActivateTotp(app_.baseUrl, login.cookie, userId)

    const res = await fetch(`${app_.baseUrl}/auth/mfa/verify`, {
      method: 'POST',
      headers: { Cookie: login.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'totp', code: '000000' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.code, 'VERIFICATION_FAILED')
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})

// Regression test for a real bug found while building the frontend: a
// TOTP-only user (the majority case for anyone without a hardware
// key/platform authenticator) has zero enrolled passkeys, and
// generateAuthenticationChallenge throws CREDENTIAL_NOT_FOUND for that user
// — both /auth/mfa/verify/options and /auth/step-up/options must degrade to
// a clean `{ challenge: null }` (baseline) / `{ alreadyGranted: false,
// challenge: null }` (step-up) instead of surfacing that as an error, since
// TOTP-only is a fully legitimate, expected configuration (docs/MFA.md).
test('MFA/step-up options endpoints degrade cleanly to challenge:null for a TOTP-only user (no enrolled passkey)', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('totp-only-options')
  let userId
  try {
    const login = await loginViaOtp(app_.baseUrl, identifier)
    userId = login.userId
    const { secret, lastStep } = await enrollAndActivateTotp(app_.baseUrl, login.cookie, userId)
    const baseline = await verifyBaselineMfaTotp(app_.baseUrl, login.cookie, secret, lastStep)
    assert.equal(baseline.res.status, 200)

    const verifyOptionsRes = await fetch(`${app_.baseUrl}/auth/mfa/verify/options`, { method: 'POST', headers: { Cookie: login.cookie } })
    assert.equal(verifyOptionsRes.status, 200, 'must never surface CREDENTIAL_NOT_FOUND as an error for a TOTP-only user')
    const verifyOptionsBody = await verifyOptionsRes.json()
    assert.equal(verifyOptionsBody.challenge, null)

    const stepUpOptionsRes = await fetch(`${app_.baseUrl}/auth/step-up/options`, {
      method: 'POST',
      headers: { Cookie: login.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionScope: 'TOTP_DISABLE' }),
    })
    assert.equal(stepUpOptionsRes.status, 200)
    const stepUpOptionsBody = await stepUpOptionsRes.json()
    assert.equal(stepUpOptionsBody.alreadyGranted, false)
    assert.equal(stepUpOptionsBody.challenge, null)
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})

test('legacy JWT bearer super_admin hitting an MFA-gated route gets 403 MFA_REQUIRED, never a 500', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('legacy-jwt')
  let userId
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_role_id) VALUES ($1,$2,'not-a-real-hash','staff',1) RETURNING id`,
      ['Legacy JWT Super Admin', identifier],
    )
    userId = rows[0].id
    const legacyToken = signToken({ id: userId })

    // /auth/mfa/status is requireAuth-only (not gated) — proves the JWT
    // path itself works and correctly reports verified:false, required:true.
    const statusRes = await fetch(`${app_.baseUrl}/auth/mfa/status`, { headers: { Authorization: `Bearer ${legacyToken}` } })
    assert.equal(statusRes.status, 200)
    const status = await statusRes.json()
    assert.equal(status.mfa.required, true)
    assert.equal(status.mfa.verified, false)

    // POST /staff is requireStaffRole('super_admin') — MFA-gated.
    const staffRes = await fetch(`${app_.baseUrl}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${legacyToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: testEmail('legacy-jwt-target'), password: 'password123', role: 'admin' }),
    })
    assert.equal(staffRes.status, 403)
    const body = await staffRes.json()
    assert.equal(body.code, 'MFA_REQUIRED')
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})

test('MFA verify/step-up endpoints require a real session — a legacy JWT bearer gets a clean validation error, not a crash on req.session.id', async () => {
  const app_ = await startTestApp()
  const identifier = testEmail('legacy-jwt-verify')
  let userId
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING id`,
      ['Legacy JWT Player', identifier],
    )
    userId = rows[0].id
    const legacyToken = signToken({ id: userId })

    const res = await fetch(`${app_.baseUrl}/auth/mfa/totp/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${legacyToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
  } finally {
    await cleanupUser(userId)
    await app_.close()
  }
})
