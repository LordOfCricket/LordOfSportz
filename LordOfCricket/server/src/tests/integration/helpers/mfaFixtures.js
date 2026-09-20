// Phase 6 — shared fixture helpers for tests that need a REAL, MFA-verified
// privileged session (Super Admin or Ground Owner), not a bare JWT. Every
// Phase 6 privileged-route gate requires req.mfaVerified, which only a
// session-cookie login can ever set (see docs/MFA.md) — a bare
// `signToken({id})` JWT, the pattern used throughout Phases 1-5's tests, can
// never pass these gates by design. New test files, and any pre-existing
// test updated to work with Phase 6, both use these helpers rather than
// hand-rolling TOTP timing/session-cookie logic per file.
//
// Reuses the exact "recover the OTP from its hash, extract Set-Cookie"
// pattern from otpAuth.integration.test.js — genuine signed session
// cookies, never a hand-crafted cookie-parser HMAC.
import { createHash } from 'node:crypto'
import { generate } from 'otplib'
import { sign } from 'cookie-signature'
import { pool } from '../../../config/db.js'
import { decryptSecret } from '../../../services/totp.service.js'
import { createSessionForUser } from '../../../services/session.service.js'
import { issueStepUpGrant } from '../../../services/stepUp.service.js'
import { SESSION_COOKIE_NAME } from '../../../middlewares/session.js'

const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'dev-only-insecure-cookie-secret-change-me'

// HTTP-independent session fixture for the many PRE-Phase-6 integration
// tests that authenticate as a Super Admin/Ground Owner purely to set up
// preconditions for UNRELATED functionality under test (umpire assignment,
// ground media, commentary, etc.) — those tests already skip a real signup
// ceremony by inserting the user row directly via SQL, so skipping a real
// OTP round-trip for the session too is the same class of shortcut, not a
// new one. Calls the REAL session.service.js#createSessionForUser (real
// session row, real token hash) and signs the cookie value with the exact
// same `cookie-signature` library + secret express's own `res.cookie(...,
// {signed:true})` uses (see middlewares/session.js) — not a hand-rolled
// HMAC. mfa_verified_at is set directly since these tests were never about
// proving a TOTP/WebAuthn ceremony, only about reaching an
// already-privileged, already-MFA-satisfied state. Returns the sessionId
// too, so callers whose gated action ALSO needs a step-up grant (STAFF_
// CREATE, GROUND_OWNER_REQUEST_APPROVE, PERMISSION_GRANT, STAFF_DISABLE)
// can mint one directly via mintStepUpGrant below, same reasoning.
export async function mintMfaVerifiedSessionCookie(userId) {
  const { rawToken } = await createSessionForUser(userId)
  const { rows } = await pool.query(`SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId])
  const sessionId = rows[0].id
  await pool.query(`UPDATE sessions SET mfa_verified_at = NOW() WHERE id = $1`, [sessionId])
  const signedValue = `s:${sign(rawToken, SESSION_COOKIE_SECRET)}`
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(signedValue)}`
  return { cookie, sessionId }
}

// Directly issues a step-up grant via the REAL stepUp.service.js (real TTL,
// real single-use row) — skips only the "prove a factor" verification
// ceremony, for the same reason mintMfaVerifiedSessionCookie skips it.
export async function mintStepUpGrant(sessionId, userId, actionScope) {
  await issueStepUpGrant(sessionId, userId, actionScope)
}

export async function recoverOtpCode(identifier) {
  const { rows } = await pool.query('SELECT otp_hash FROM otp_codes WHERE identifier = $1 ORDER BY created_at DESC LIMIT 1', [identifier])
  const otpHash = rows[0]?.otp_hash
  if (!otpHash) return null
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, '0')
    if (createHash('sha256').update(candidate).digest('hex') === otpHash) return candidate
  }
  return null
}

export function extractCookie(response) {
  const setCookie = response.headers.get('set-cookie')
  return setCookie ? setCookie.split(';')[0] : null
}

// Real OTP login (send-otp + verify-otp over HTTP) — creates a genuine
// `sessions` row, unlike every pre-Phase-6 test fixture's bare JWT.
export async function loginViaOtp(baseUrl, identifier) {
  await fetch(`${baseUrl}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) })
  const code = await recoverOtpCode(identifier)
  const res = await fetch(`${baseUrl}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) })
  const body = await res.json()
  if (!body?.user?.id) throw new Error(`loginViaOtp failed for ${identifier}: ${JSON.stringify(body)}`)
  return { userId: body.user.id, cookie: extractCookie(res) }
}

export async function promoteToSuperAdmin(userId) {
  await pool.query(`UPDATE users SET role = 'staff', staff_role_id = 1 WHERE id = $1`, [userId]) // staff_roles.id=1 = super_admin
}

function currentTotpStep() {
  return Math.floor(Date.now() / 30000)
}

// otplib's generate() always uses the current wall-clock step. Two
// verifications against the same secret in quick succession would otherwise
// land in the same 30s step and get correctly rejected as a replay by the
// application's own last_verified_step guard (see domain/mfa/replayGuard.js)
// — this is application behavior working as designed, not a test bug, so
// the test fixture must genuinely wait for a new step rather than fight it.
//
// SAFETY_MARGIN_MS: generating a code in the last couple seconds of its
// 30s step is a real flake source under real network/process latency — by
// the time the HTTP request reaches the server, the step may have already
// rolled over, and otplib's default window doesn't cover more than one step
// either side. Found via an intermittent failure in the full test suite
// (never reproduced when this file ran alone, which is exactly the profile
// of a step-boundary race under load) — waiting until at least
// SAFETY_MARGIN_MS remains before generating removes that race rather than
// widening otplib's own verification window (which would weaken replay
// protection in production for a test-only timing problem).
const SAFETY_MARGIN_MS = 3000

export async function nextTotpCode(secret, avoidStep = null) {
  while (avoidStep != null && currentTotpStep() === avoidStep) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const msIntoStep = Date.now() % 30000
  const msRemaining = 30000 - msIntoStep
  if (msRemaining < SAFETY_MARGIN_MS) {
    await new Promise((resolve) => setTimeout(resolve, msRemaining + 250))
  }
  const code = await generate({ secret })
  return { code, step: currentTotpStep() }
}

// Enrolls (bootstrap — no step-up needed, since hasAnyActiveFactor is false
// beforehand) and activates a TOTP factor for an already-logged-in session.
// Returns the decrypted secret and the time-step the activation code
// consumed, so the caller can request a fresh, non-replayed code next.
export async function enrollAndActivateTotp(baseUrl, cookie, userId) {
  const enrollRes = await fetch(`${baseUrl}/auth/mfa/totp/enroll`, { method: 'POST', headers: { Cookie: cookie } })
  if (enrollRes.status !== 200) throw new Error(`TOTP enroll failed: ${enrollRes.status} ${await enrollRes.text()}`)

  const { rows } = await pool.query(
    `SELECT encrypted_secret FROM totp_credentials WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  const secret = decryptSecret(rows[0].encrypted_secret)
  const { code, step } = await nextTotpCode(secret)

  const verifyRes = await fetch(`${baseUrl}/auth/mfa/totp/verify`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (verifyRes.status !== 200) throw new Error(`TOTP activation failed: ${verifyRes.status} ${await verifyRes.text()}`)

  return { secret, lastStep: step }
}

// Baseline MFA verification (sets sessions.mfa_verified_at) — requires an
// already-ACTIVE TOTP factor. `avoidStep` must be the step consumed by the
// most recent code generated against this same secret (enrollment
// activation, a prior baseline verify, or a prior step-up verify).
export async function verifyBaselineMfaTotp(baseUrl, cookie, secret, avoidStep) {
  const { code, step } = await nextTotpCode(secret, avoidStep)
  const res = await fetch(`${baseUrl}/auth/mfa/verify`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'totp', code }),
  })
  return { res, step }
}

export async function stepUpVerifyTotp(baseUrl, cookie, secret, avoidStep, actionScope) {
  const { code, step } = await nextTotpCode(secret, avoidStep)
  const res = await fetch(`${baseUrl}/auth/step-up/verify`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionScope, method: 'totp', code }),
  })
  return { res, step }
}

// Full fixture: a fresh user, logged in via a real session, promoted to
// Super Admin, with an active TOTP factor and a fresh MFA-verified session —
// i.e. exactly the state a real Super Admin reaches after OTP login + one
// MFA verification. `lastStep` is returned so callers can request further
// fresh (non-replayed) codes for step-up verification.
export async function createMfaVerifiedSuperAdmin(baseUrl, identifier) {
  const { userId, cookie } = await loginViaOtp(baseUrl, identifier)
  await promoteToSuperAdmin(userId)
  const { secret, lastStep } = await enrollAndActivateTotp(baseUrl, cookie, userId)
  const { res, step } = await verifyBaselineMfaTotp(baseUrl, cookie, secret, lastStep)
  if (res.status !== 200) throw new Error(`Baseline MFA verify failed: ${res.status} ${await res.text()}`)
  return { userId, cookie, secret, lastStep: step }
}

// Same as createMfaVerifiedSuperAdmin but for a Ground Owner of a
// freshly-created ground —
// `groundId`/`publicGroundId` are returned for the caller to use in
// ground-scoped route assertions.
export async function createMfaVerifiedGroundOwner(baseUrl, identifier, ground) {
  const { userId, cookie } = await loginViaOtp(baseUrl, identifier)
  const { createMembership } = await import('../../../models/groundUser.model.js')
  await createMembership({ groundId: ground.id, userId, role: 'GROUND_OWNER' })
  const { secret, lastStep } = await enrollAndActivateTotp(baseUrl, cookie, userId)
  const { res, step } = await verifyBaselineMfaTotp(baseUrl, cookie, secret, lastStep)
  if (res.status !== 200) throw new Error(`Baseline MFA verify failed: ${res.status} ${await res.text()}`)
  return { userId, cookie, secret, lastStep: step }
}
