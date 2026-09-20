// Phase 6 — pure TOTP replay-window check, factored out of
// totp.service.js#verifyTotpCode for unit testing. otplib's own `verify`
// tolerates small clock drift by matching a window of time-steps; this is
// the separate, deliberate defense against reusing the *same* accepted step
// twice (someone shoulder-surfing a code has ~30s to try it once, not
// indefinitely within the drift window).
export function isReplayedStep(lastVerifiedStep, matchedStep) {
  return lastVerifiedStep != null && Number(lastVerifiedStep) === matchedStep
}
