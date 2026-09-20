// Phase 6 — pure WebAuthn signature-counter rollback check, factored out of
// webauthn.service.js#verifyAuthentication for unit testing. A lower-or-
// equal counter than what's stored strongly suggests a cloned authenticator
// (the credential's private key was copied and used from two places) — the
// one documented exception is when BOTH are zero, which some authenticators
// (particularly platform ones backed by cloud sync) legitimately never
// increment past.
export function isCounterRollback(storedCounter, newCounter) {
  const bothZero = storedCounter === 0 && newCounter === 0
  if (bothZero) return false
  return newCounter <= storedCounter
}
