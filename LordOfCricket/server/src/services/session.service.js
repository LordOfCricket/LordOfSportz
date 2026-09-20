import { generateSessionToken, hashSessionToken } from '../domain/otpAuth/sessionToken.js'
import { getSessionTtlDays } from '../domain/otpAuth/otp.js'
import {
  createSession,
  findActiveSessionByTokenHash,
  touchLastUsed,
  revokeSessionByTokenHash,
  revokeAllSessionsForUser as revokeAllSessionsForUserRepo,
  revokeAllSessionsForUserExceptCurrent as revokeAllSessionsForUserExceptCurrentRepo,
} from '../repositories/prisma/session.prisma-repository.js'
import { logger } from '../utils/logger.js'

export async function createSessionForUser(userId, { ipAddress = null, userAgent = null } = {}) {
  const rawToken = generateSessionToken()
  const tokenHash = hashSessionToken(rawToken)
  const expiresAt = new Date(Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000)

  await createSession({ userId, tokenHash, expiresAt, ipAddress, userAgent })
  logger.info('Session created', { userId })

  return { rawToken, expiresAt }
}

// Returns the session row (with `user_id`) if `rawToken` maps to a
// currently active, unexpired, unrevoked session — null otherwise. Never
// throws; middlewares/session.js decides what "no valid session" means for
// the request (fall through to the legacy JWT path, or 401).
export async function validateSessionToken(rawToken) {
  const tokenHash = hashSessionToken(rawToken)
  const session = await findActiveSessionByTokenHash(tokenHash)
  if (!session) return null

  await touchLastUsed(session.id)
  return session
}

export async function revokeSession(rawToken) {
  const tokenHash = hashSessionToken(rawToken)
  await revokeSessionByTokenHash(tokenHash)
  logger.info('Session revoked (logout)')
}

// Auth Enhancement — password reset's "old sessions should not remain
// indefinitely valid" requirement. The repository function already existed
// (added for a future "log out everywhere"/suspension feature, never
// called) — this is its first real caller. Unlike
// revokeAllSessionsForUserExceptCurrent (Phase 6, used when an already-
// logged-in user changes a security-sensitive factor), a password reset
// happens via the logged-OUT forgot-password flow — there is no "current
// session" to exempt, every session for this user is compromised-by-
// association and should end.
export async function revokeAllSessionsForUser(userId) {
  await revokeAllSessionsForUserRepo(userId)
  logger.info('All sessions revoked for user (password reset)', { userId })
}

// SUPER_ADMIN Identity & Secure Provisioning feature — self-service
// change-password happens WHILE authenticated (unlike the logged-out
// forgot-password flow above), so the current session should survive its
// own action; every OTHER session is treated as compromised-by-association
// exactly like a full password reset. The repository function already
// existed (mfaEnrollment.service.js has used it since Phase 6 for
// factor-management mutations) — this is its first service-layer wrapper,
// added for consistency with revokeAllSessionsForUser's own wrapped shape
// rather than reaching into the repository directly.
export async function revokeAllSessionsForUserExceptCurrent(userId, currentSessionId) {
  await revokeAllSessionsForUserExceptCurrentRepo(userId, currentSessionId)
  logger.info('All other sessions revoked for user (password changed)', { userId })
}
