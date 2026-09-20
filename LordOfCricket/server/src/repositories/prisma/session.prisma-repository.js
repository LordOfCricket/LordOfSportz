import { prisma } from '../../config/prisma.js'

// Phase 3 — sessions is a brand-new table, same reasoning as
// otpCode.prisma-repository.js for why this is Prisma-backed.

export async function createSession({ userId, tokenHash, expiresAt, ipAddress = null, userAgent = null }) {
  return prisma.sessions.create({
    data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt, ip_address: ipAddress, user_agent: userAgent },
  })
}

// The one query middlewares/session.js runs on every authenticated
// request — keyed on the unique, indexed token_hash, so it stays O(1)
// regardless of how many sessions accumulate.
export async function findActiveSessionByTokenHash(tokenHash) {
  return prisma.sessions.findFirst({
    where: { token_hash: tokenHash, revoked_at: null, expires_at: { gt: new Date() } },
  })
}

export async function touchLastUsed(id) {
  return prisma.sessions.update({ where: { id }, data: { last_used_at: new Date() } })
}

export async function revokeSessionByTokenHash(tokenHash) {
  await prisma.sessions.updateMany({ where: { token_hash: tokenHash, revoked_at: null }, data: { revoked_at: new Date() } })
}

// Not called by the login/logout flow itself — available for a future
// "log out everywhere" feature or an account-suspension action.
export async function revokeAllSessionsForUser(userId) {
  await prisma.sessions.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } })
}

// Phase 6 — first real caller of session revocation: after a
// security-sensitive factor change (MFA disable, passkey/TOTP removal,
// recovery-code regeneration), every OTHER session for this user is
// revoked, but never the session the person is currently acting from —
// revokeAllSessionsForUser above would immediately log out the very person
// who just performed the action.
export async function revokeAllSessionsForUserExceptCurrent(userId, currentSessionId) {
  await prisma.sessions.updateMany({
    where: { user_id: userId, id: { not: currentSessionId }, revoked_at: null },
    data: { revoked_at: new Date() },
  })
}

// Sets the "privileged session" marker used by requireStaffRole/
// requireGroundRole/requireGroundPermission's MFA gate (Phase 6) — see
// mfaState.service.js#computeMfaVerified for the freshness/TTL check
// applied to this timestamp on every subsequent request.
export async function markMfaVerified(sessionId) {
  return prisma.sessions.update({ where: { id: sessionId }, data: { mfa_verified_at: new Date() } })
}
