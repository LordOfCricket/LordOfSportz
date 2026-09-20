// Phase 3 — session cookie constants + helpers, shared by the auth
// controller (sets/clears the cookie on login/logout) and requireAuth
// (middlewares/auth.js — reads it). Kept in its own file rather than
// inline in either so both call sites can never drift on cookie config.

export const SESSION_COOKIE_NAME = 'loc_session'

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  }
}

// `signed: true` uses cookie-parser's SESSION_COOKIE_SECRET (see app.js) to
// append an HMAC to the cookie value — a tampered/forged cookie value fails
// signature verification before ever reaching a database lookup, which is
// defense-in-depth on top of (not instead of) the fact that the raw token
// itself is a 256-bit CSPRNG value no one could forge anyway.
export function setSessionCookie(res, rawToken, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, rawToken, { ...cookieOptions(new Date(expiresAt).getTime() - Date.now()), signed: true })
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' })
}
