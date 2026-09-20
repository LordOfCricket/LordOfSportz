// Phase 20 Feature 1 — fail fast, with a clear message, rather than boot
// into a broken state. `utils/jwt.js` already refuses to boot in production
// without JWT_SECRET (a pre-existing, separate check, left as-is); this
// covers the other variables the app cannot run without in production —
// previously a missing PG_* var surfaced only as an opaque driver error
// ("password authentication failed", "getaddrinfo ENOTFOUND undefined")
// several layers away from the actual cause, and a missing CLIENT_ORIGIN
// silently produced a CORS allow-list of zero origins with no explanation.
//
// Deliberately narrow: only variables the app cannot function without in
// production. Every optional integration (Mongo, Google Calendar, AI,
// Cloudinary, CricAPI) already degrades gracefully by design (see
// docs/ARCHITECTURE.md) and must stay optional here too — this is not the
// place to make an optional feature mandatory.

// Phase 6 — MFA_ENCRYPTION_KEY (encrypts TOTP secrets at rest) and the
// WEBAUTHN_* trio (RP ID/name/allowed origins) join the list for the same
// reason as everything else here: a misconfigured value must fail loudly at
// boot, not silently accept a wrong RP ID/origin that would make every
// passkey ceremony fail confusingly in production, or (worse) accept one
// that's wider than intended.
const REQUIRED_IN_PRODUCTION = [
  'JWT_SECRET',
  'SESSION_COOKIE_SECRET',
  'PG_USER',
  'PG_HOST',
  'PG_DATABASE',
  'PG_PASSWORD',
  'PG_PORT',
  'CLIENT_ORIGIN',
  'MFA_ENCRYPTION_KEY',
  'WEBAUTHN_RP_ID',
  'WEBAUTHN_RP_NAME',
  'WEBAUTHN_ORIGIN',
]

export function validateEnv() {
  if (process.env.NODE_ENV !== 'production') return

  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s) in production: ${missing.join(', ')}. See server/.env.example.`)
  }

  // MFA_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256) — checked
  // here at boot, not lazily on the first TOTP enrollment, so a
  // misconfigured key fails the same way a missing one does.
  const keyBytes = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64')
  if (keyBytes.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte value (AES-256). See server/.env.example.')
  }
}
