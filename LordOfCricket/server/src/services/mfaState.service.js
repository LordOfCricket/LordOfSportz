import { countActiveCredentialsForUser } from '../models/webauthnCredential.model.js'
import { findActiveByUserId as findActiveTotp } from '../models/totpCredential.model.js'
import { markMfaVerified } from '../repositories/prisma/session.prisma-repository.js'

const DEFAULT_MFA_VERIFIED_TTL_MINUTES = 15

// Phase 6 — the shared read-side used by requireAuth, /auth/me, and every
// MFA-gate check. Pure orchestration, no crypto, no WebAuthn/TOTP-specific
// logic — see webauthn.service.js/totp.service.js for that.

export function getMfaVerifiedTtlMs() {
  return (Number(process.env.MFA_VERIFIED_TTL_MINUTES) || DEFAULT_MFA_VERIFIED_TTL_MINUTES) * 60 * 1000
}

// Single source of truth for "does this user have a working MFA factor
// right now" — used both by the bootstrap-vs-step-up branch (a user with
// zero active factors enrolls their first one without step-up) and by
// /auth/me's `enrolled` flag. A revoked passkey or a disabled/never-verified
// TOTP secret never counts.
export async function hasAnyActiveFactor(userId) {
  const [webauthnCount, totp] = await Promise.all([countActiveCredentialsForUser(userId), findActiveTotp(userId)])
  return webauthnCount > 0 || Boolean(totp)
}

// MFA enforcement removed at the request of the project owner — this is now
// the single point that makes every gate in groundAccess.js/auth.js that
// checks req.mfaVerified permanently pass. isMfaVerificationFresh/
// getMfaVerifiedTtlMs are kept (still exported, still used by
// markSessionMfaVerified's callers and /auth/me's status display) — only
// the enforcement decision itself was removed.
export function computeMfaVerified() {
  return true
}

export async function markSessionMfaVerified(sessionId) {
  await markMfaVerified(sessionId)
}

// Super Admin is knowable directly from req.user (users.staff_role) with no
// extra query — Ground Owner status is intentionally NOT resolved here: the
// only two call sites that need it (requireGroundRole/requireGroundPermission)
// already have the exact ground_users membership row in hand by the time
// they need it, so a generic "is this user a ground owner anywhere" helper
// would just be a redundant extra query. See docs/AUTHORIZATION.md.
export function isSuperAdmin(user) {
  return user?.role === 'staff' && user?.staff_role === 'super_admin'
}

// Shared response shape for the 4 call sites that gate on req.mfaVerified
// (requireStaffRole's super_admin check, requireGroundRole/
// requireGroundPermission's super-admin-bypass and GROUND_OWNER branches) —
// written once so the error code/message can never drift between them.
export function respondMfaRequired(res) {
  return res.status(403).json({ code: 'MFA_REQUIRED', error: 'MFA verification is required for this account.' })
}
