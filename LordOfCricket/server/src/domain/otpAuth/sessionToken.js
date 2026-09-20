// Phase 3 — pure session-token domain logic (generation/hashing only, no
// database/cookie I/O — that's services/session.service.js and
// middlewares/session.js respectively).

import { randomBytes, createHash } from 'node:crypto'

// 256 bits of CSPRNG entropy, hex-encoded (64 chars) — this is the raw value
// that goes into the cookie. It is NEVER written to the database; only its
// hash is (see hashSessionToken), same principle as password_hash never
// storing a raw password.
export function generateSessionToken() {
  return randomBytes(32).toString('hex')
}

export function hashSessionToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}
