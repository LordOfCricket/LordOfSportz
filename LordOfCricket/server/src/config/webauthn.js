// Phase 6 — WebAuthn RP configuration, centralized (never trusted from the
// browser — the brief is explicit: RP ID/name/allowed origins must be
// server-side config only). Production values are required
// (validateEnv.js); these dev fallbacks exist purely so local development
// doesn't need a `.env` entry to exercise the feature, matching the
// existing OTP_* getters' "sane default if unset" convention.

export function getRpId() {
  return process.env.WEBAUTHN_RP_ID || 'localhost'
}

export function getRpName() {
  return process.env.WEBAUTHN_RP_NAME || 'Lord Of Cricket'
}

// Array of exact allowed origins (scheme+host+port) — @simplewebauthn/server
// accepts either a single string or an array for expectedOrigin; passing an
// array here means a request from ANY origin not in this list fails
// verification, never silently matched against a wildcard.
export function getExpectedOrigins() {
  const raw = process.env.WEBAUTHN_ORIGIN
  if (!raw) return ['http://localhost:5173']
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getChallengeTtlMs() {
  return (Number(process.env.WEBAUTHN_CHALLENGE_TTL_MINUTES) || 5) * 60 * 1000
}
