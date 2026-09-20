// Shared Socket.IO authentication helper — extracted from matchChatRealtime.js
// (Phase 8) so a second realtime module (canteen order/staff rooms, this
// task) doesn't grow its own competing re-implementation of signed-cookie
// verification. Two independent copies of security-critical cookie-parsing
// code is exactly the kind of thing that quietly drifts (one gets a fix the
// other doesn't) — not a cosmetic dedupe.
//
// Same dual-path shape as requireAuth (middlewares/auth.js): HttpOnly
// session cookie first (the primary path every real client uses — Socket.IO
// carries it automatically once the client connects with
// `withCredentials: true` and the server's CORS allows credentials, see
// server.js), legacy JWT bearer second (kept only because the integration
// test suite mints JWTs directly via signToken({id}) as an auth-fixture
// shortcut across 51 files — no real user has had a JWT to send since
// Phase 3 replaced password login with OTP, see docs/AUTH.md).
import { unsign } from 'cookie-signature'
import { verifyToken } from '../utils/jwt.js'
import { findUserById } from '../models/user.model.js'
import { validateSessionToken } from '../services/session.service.js'
import { SESSION_COOKIE_NAME } from '../middlewares/session.js'

const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'dev-only-insecure-cookie-secret-change-me'

export function readSessionCookie(cookieHeader) {
  if (!cookieHeader) return null
  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
  if (!entry) return null
  const raw = decodeURIComponent(entry.slice(SESSION_COOKIE_NAME.length + 1))
  if (!raw.startsWith('s:')) return null
  const unsigned = unsign(raw.slice(2), SESSION_COOKIE_SECRET)
  return unsigned || null
}

// `legacyToken` is optional and caller-supplied — matchChatRealtime.js reads
// it from its join payload (`payload.token`); canteen's handlers (server.js)
// read it once from `socket.handshake.auth.token` at connection time instead,
// since their event payloads are plain primitives (userId/orderId) that this
// task's brief says not to reshape into objects.
export async function authenticateSocketUser(socket, legacyToken) {
  const sessionToken = readSessionCookie(socket.handshake.headers.cookie)
  if (sessionToken) {
    const session = await validateSessionToken(sessionToken)
    if (session) return findUserById(session.user_id)
  }
  if (!legacyToken) return null
  try {
    const payload = verifyToken(legacyToken)
    return await findUserById(payload.id)
  } catch {
    return null
  }
}
