import { generateOtpCode, hashOtpCode, isOtpMatch, isExpired, getOtpTtlMinutes, getOtpMaxAttempts, getResendCooldownSeconds, maskIdentifier } from '../domain/otpAuth/otp.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as CODES } from '../domain/otpAuth/errors.js'
import { createOtpCode, invalidatePendingForIdentifier, incrementAttempts, markVerified, markLocked, countRecentRequestsForIdentifier, findMostRecentForIdentifier } from '../repositories/prisma/otpCode.prisma-repository.js'
import { resolveProvider, sendConsoleOtp, sendTwilioVerification, checkTwilioVerification, sendSendgridOtp } from './otpProviders/index.js'
import { logger } from '../utils/logger.js'

const MAX_REQUESTS_PER_IDENTIFIER_PER_HOUR = 5

// §9's "not just IP" requirement, layered under the route-level IP-based
// otpRequestLimiter (middlewares/rateLimit.js). Backed by a real Postgres
// read (otp_codes rows), so this dimension is correctly shared across every
// backend replica — no in-memory/per-pod state, no Redis needed for this to
// work under Kubernetes horizontal scaling.
async function assertNotRateLimited(identifier) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentCount = await countRecentRequestsForIdentifier(identifier, oneHourAgo)
  if (recentCount >= MAX_REQUESTS_PER_IDENTIFIER_PER_HOUR) {
    throw new OtpAuthError(CODES.TOO_MANY_REQUESTS, 'Too many OTP requests. Please try again later.')
  }
}

async function assertResendCooldownElapsed(identifier, purpose) {
  const mostRecent = await findMostRecentForIdentifier(identifier, purpose)
  if (!mostRecent) return
  const cooldownMs = getResendCooldownSeconds() * 1000
  const elapsedMs = Date.now() - new Date(mostRecent.created_at).getTime()
  if (elapsedMs < cooldownMs) {
    throw new OtpAuthError(CODES.RESEND_COOLDOWN, 'Please wait before requesting another code.', {
      retryAfterSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
    })
  }
}

// Requests a new OTP be sent to `identifier`. Never reveals whether an
// account exists for this identifier — that check happens later, in
// otpAuth.service.js, only after a code is successfully verified.
//
// `purpose` scopes the request/cooldown/invalidation to one of
// LOGIN/REGISTER_PLAYER/REGISTER_UMPIRE (Phase 4) so, e.g., requesting a
// registration code doesn't invalidate an unrelated pending login code for
// the same identifier, or vice versa. `metadata` optionally stages
// registration-time fields (currently just `{ name }`) that aren't known
// yet at verification time — read back by otpAuth.service.js#verifyLoginOtp
// once the code is confirmed.
export async function requestOtp({ identifier, identifierType, purpose = 'LOGIN', metadata = null }) {
  await assertResendCooldownElapsed(identifier, purpose)
  await assertNotRateLimited(identifier)
  await invalidatePendingForIdentifier(identifier, purpose)

  const provider = resolveProvider(identifierType)
  const expiresAt = new Date(Date.now() + getOtpTtlMinutes() * 60 * 1000)
  const maxAttempts = getOtpMaxAttempts()

  if (provider === 'TWILIO_VERIFY') {
    await sendTwilioVerification(identifier)
    await createOtpCode({ identifier, identifierType, purpose, provider, otpHash: null, expiresAt, maxAttempts, metadata })
  } else {
    const code = generateOtpCode()
    const otpHash = hashOtpCode(code)
    await createOtpCode({ identifier, identifierType, purpose, provider, otpHash, expiresAt, maxAttempts, metadata })
    if (provider === 'SENDGRID') await sendSendgridOtp({ identifier, code })
    else await sendConsoleOtp({ identifier, identifierType, code })
  }

  logger.info('OTP requested', { identifier: maskIdentifier(identifier, identifierType), identifierType, provider, purpose })
  return { sent: true }
}

// Verifies `code` against the current pending OTP for `identifier`. Throws
// a generic OtpAuthError on any failure (no OTP found, expired, locked,
// wrong code) — callers must not surface which specific reason applied to
// the client (§7's anti-enumeration requirement), only log it server-side.
export async function verifyOtp({ identifier, identifierType, code }) {
  // Deliberately the MOST RECENT row regardless of status (not
  // status-filtered to PENDING only) — a LOCKED or EXPIRED row must still
  // be found here so a follow-up attempt against it gets that specific
  // state (for logging/audit — the client-facing message stays generic
  // either way, see the shared "Invalid or expired code." text below)
  // rather than being misreported as "no code was ever requested".
  const otpRow = await findMostRecentForIdentifier(identifier)

  if (!otpRow) {
    logger.warn('OTP verification failed: no code ever requested', { identifier: maskIdentifier(identifier, identifierType) })
    throw new OtpAuthError(CODES.INVALID_OTP, 'Invalid or expired code.')
  }
  if (otpRow.status === 'VERIFIED') {
    // A consumed code can never be replayed, even if somehow still within
    // its expiry window.
    logger.warn('OTP verification failed: code already used', { identifier: maskIdentifier(identifier, identifierType) })
    throw new OtpAuthError(CODES.INVALID_OTP, 'Invalid or expired code.')
  }
  if (otpRow.status === 'LOCKED') {
    logger.warn('OTP verification failed: locked (too many attempts)', { identifier: maskIdentifier(identifier, identifierType) })
    throw new OtpAuthError(CODES.OTP_LOCKED, 'Invalid or expired code.')
  }
  if (otpRow.status === 'EXPIRED' || isExpired(otpRow.expires_at)) {
    logger.warn('OTP verification failed: expired', { identifier: maskIdentifier(identifier, identifierType) })
    throw new OtpAuthError(CODES.OTP_EXPIRED, 'Invalid or expired code.')
  }
  if (otpRow.attempts >= otpRow.max_attempts) {
    await markLocked(otpRow.id)
    logger.warn('OTP verification failed: locked (too many attempts)', { identifier: maskIdentifier(identifier, identifierType) })
    throw new OtpAuthError(CODES.OTP_LOCKED, 'Invalid or expired code.')
  }

  const isValid = otpRow.provider === 'TWILIO_VERIFY' ? await checkTwilioVerification(identifier, code) : isOtpMatch(code, otpRow.otp_hash)

  if (!isValid) {
    const updated = await incrementAttempts(otpRow.id)
    if (updated.attempts >= updated.max_attempts) await markLocked(otpRow.id)
    logger.warn('OTP verification failed: incorrect code', { identifier: maskIdentifier(identifier, identifierType), attempts: updated.attempts })
    throw new OtpAuthError(CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  // Flip the row to VERIFIED immediately on a correct match — this is what
  // makes the `status === 'VERIFIED'` replay check above actually bite.
  // user_id isn't known yet at this layer (otpAuth.service.js resolves/
  // creates the user afterward using otpRow.identifier), so it's recorded
  // null here; the row's purpose/identifier are already enough to prevent
  // the same code being consumed twice.
  await markVerified(otpRow.id, null)

  logger.info('OTP verification succeeded', { identifier: maskIdentifier(identifier, identifierType), identifierType, purpose: otpRow.purpose })
  return otpRow
}
