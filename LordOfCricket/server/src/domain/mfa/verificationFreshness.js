// Phase 6 — pure TTL-boundary check for sessions.mfa_verified_at, factored
// out of mfaState.service.js#computeMfaVerified for unit testing (`now` is
// injectable, same convention as domain/otpAuth/otp.js#isExpired).
export function isMfaVerificationFresh(mfaVerifiedAt, ttlMs, now = Date.now()) {
  if (!mfaVerifiedAt) return false
  const verifiedAtMs = new Date(mfaVerifiedAt).getTime()
  return now - verifiedAtMs < ttlMs
}
