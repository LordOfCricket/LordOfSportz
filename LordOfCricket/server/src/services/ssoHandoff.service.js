import { createHash, randomBytes } from 'node:crypto'

// Short-lived, ONE-TIME cross-app sign-in codes. A signed-in app asks for a
// code bound to a destination audience; the destination redeems it once and
// gets its OWN session — raw session tokens are never handed between apps.
// Held in process memory (single-instance); a multi-instance deployment needs
// a shared store (e.g. Redis) behind these same three functions.
const TTL_MS = 60 * 1000
const MAX_PENDING = 10000
export const SSO_AUDIENCES = ['karate', 'cricket-mobile']

const pending = new Map()

const hash = (code) => createHash('sha256').update(code).digest('hex')

function sweep(now) {
  for (const [key, entry] of pending) if (entry.expiresAt <= now) pending.delete(key)
}

export function createHandoff(userId, audience) {
  if (!SSO_AUDIENCES.includes(audience)) return null
  const now = Date.now()
  sweep(now)
  if (pending.size >= MAX_PENDING) return null
  const code = randomBytes(32).toString('base64url')
  pending.set(hash(code), { userId, audience, expiresAt: now + TTL_MS })
  return { code, expiresInSeconds: TTL_MS / 1000 }
}

/** Consumes the code: returns the userId once, or null (unknown, reused, expired, wrong audience). */
export function redeemHandoff(code, audience) {
  if (typeof code !== 'string' || code.length > 100) return null
  const key = hash(code)
  const entry = pending.get(key)
  pending.delete(key)
  if (!entry || entry.expiresAt <= Date.now() || entry.audience !== audience) return null
  return entry.userId
}
