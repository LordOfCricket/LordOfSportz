import jwt from 'jsonwebtoken'

// Pre-Phase-11 cleanup security fix: a production deployment that forgets to
// set JWT_SECRET must never silently sign real sessions with the hardcoded
// dev fallback below (its value is public — anyone reading this file could
// forge a valid login token). Dev/test are unaffected: JWT_SECRET is set in
// server/.env locally, and this check only fires when NODE_ENV=production.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production — refusing to start with the insecure development fallback secret.')
}

const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me'
const EXPIRES_IN = '7d'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}
