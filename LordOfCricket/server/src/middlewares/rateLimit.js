import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { logger } from '../utils/logger.js'

// Phase 19 Feature 5 — rate limiting for the endpoint classes the spec calls
// out by name (login, AI, booking, public search, commentary, analytics).
// In-memory store (express-rate-limit's default) — correct for LOC's current
// single-instance deployment; see docs/DEPLOYMENT.md for the note on what a
// multi-instance deployment would need instead (a shared store).
//
// Every limiter logs a warning (not an error — this is expected, not a bug)
// so repeated hits are visible in the server log without being noisy per
// request.

function makeLimiter({ windowMs, max, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res, _next, options) => {
      logger.warn('Rate limit exceeded', { path: req.originalUrl, ip: req.ip, userId: req.user?.id })
      res.status(options.statusCode).json(options.message)
    },
  })
}

// Phase 6 — keyed by the authenticated user's id, not IP: these endpoints
// always run after requireAuth, and keying by IP would let unrelated staff
// behind the same office NAT/VPN rate-limit each other. Falls back to IP
// only for the (should-never-happen, since requireAuth already 401'd)
// case req.user is somehow absent.
function byUserId(req) {
  return req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)
}

// Phase 3 — OTP request/verify endpoints. This is the IP-based layer only;
// §9 explicitly warns IP rotation defeats IP-only limiting, so this is
// layered UNDER an identifier-based limit enforced in otp.service.js
// itself (backed by a real Postgres read of otp_codes rows — correctly
// shared across every backend replica, no in-memory/per-pod state). Two
// independent dimensions, neither sufficient alone.
export const otpRequestLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many OTP requests from this device. Please try again later.',
})
export const otpVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again later.',
})

// Auth Enhancement — password login is a new brute-force surface nothing
// above already covers (forgot-password/reset-password reuse
// otpRequestLimiter/otpVerifyLimiter directly since they're the same shape
// of action — request a code / submit a code — as the OTP endpoints those
// already protect). Same "not just IP" two-dimension design §9 already
// established for OTP: IP-based here (byIp, the default keyGenerator) is
// the outer layer; byAttemptedIdentifier below is the inner one, keyed on
// the normalized identifier being GUESSED AGAINST rather than the caller's
// own id (which isn't known pre-auth) — this is what actually blunts a
// distributed/rotating-IP attacker hammering one specific account's
// password, the exact gap IP-only limiting can't close.
export const passwordLoginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please try again later.',
})

function byAttemptedIdentifier(req) {
  const raw = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : ''
  return raw ? `identifier:${raw}` : ipKeyGenerator(req.ip)
}

export const passwordLoginIdentifierLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts for this account. Please try again later.',
  keyGenerator: byAttemptedIdentifier,
})

// AI calls cost real money and latency per request.
export const aiLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many AI requests. Please try again later.',
})

// Booking/block creation — generous enough for legitimate staff/customer use,
// tight enough to blunt a scripted slot-grabbing attempt.
export const bookingWriteLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Too many booking requests. Please try again shortly.',
})

// Public search/discovery — no login, so this is the main abuse surface.
export const searchLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Too many search requests. Please slow down.',
})

// Commentary is polled by live-match viewers, so the ceiling is high —
// this exists to blunt scripted scraping, not normal spectators.
export const commentaryLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: 'Too many requests. Please slow down.',
})

// Analytics/comparison reads recompute over real match history.
export const analyticsLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Too many analytics requests. Please slow down.',
})

// Ground registration (POST /grounds) — a rare, heavy, one-per-real-ground
// action, tighter than bookingWriteLimiter's 30/10min.
export const groundWriteLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many ground registration attempts. Please try again shortly.',
})

// Phase 6 — MFA/WebAuthn/TOTP/step-up/factor-management, all keyed by user
// id (see byUserId above). Two tiers: ceremony/verification attempts (an
// attacker guessing TOTP codes or replaying WebAuthn responses) get the
// tighter limit; read-only/options endpoints get the more generous one.
export const mfaVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification attempts. Please try again later.',
  keyGenerator: byUserId,
})
export const mfaManageLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many requests. Please try again later.',
  keyGenerator: byUserId,
})
export const stepUpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many step-up attempts. Please try again later.',
  keyGenerator: byUserId,
})

// New Signup Flow — POST /auth/signup/create-account. send-code/verify-code
// reuse otpRequestLimiter/otpVerifyLimiter directly (same shape of action
// those already protect); this is the one genuinely new endpoint shape —
// a rare, heavy, one-per-real-signup action, same tightness as
// groundWriteLimiter above for the identical reason.
export const accountCreationLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many account creation attempts. Please try again shortly.',
})

// SUPER_ADMIN Identity & Secure Provisioning feature — self-service
// change-password (guesses at the caller's OWN current password) and the
// admin-initiated "reset another account's password" action. Both keyed by
// the ACTING user's id (byUserId), same shape as mfaManageLimiter — a
// bootstrap Super Admin forced through this exact flow shouldn't be able
// to brute-force their own current-password confirmation indefinitely,
// and an admin resetting many accounts in a short window is itself worth
// bounding.
export const passwordChangeLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password change attempts. Please try again later.',
  keyGenerator: byUserId,
})
export const adminPasswordResetLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many password reset actions. Please try again later.',
  keyGenerator: byUserId,
})
