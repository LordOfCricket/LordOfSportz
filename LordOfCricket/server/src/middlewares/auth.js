import { verifyToken } from '../utils/jwt.js'
import { findUserById } from '../models/user.model.js'
import { isApprovedUmpireUser } from '../models/umpireRequest.model.js'
import { validateSessionToken } from '../services/session.service.js'
import { SESSION_COOKIE_NAME } from './session.js'
import { computeMfaVerified, respondMfaRequired } from '../services/mfaState.service.js'
import { logger } from '../utils/logger.js'

// Phase 3 — requireAuth is now a dispatcher over two independent
// credentials, converging on the exact same req.user shape (both branches
// ultimately call the same models/user.model.js#findUserById) so every one
// of the 67 existing `req.user.*` call sites across the app behaves
// identically regardless of which one authenticated the request:
//
//   1. Session cookie (new, Phase 3) — checked first since it's the primary
//      path going forward.
//   2. Bearer JWT (legacy, unchanged logic) — kept alive so accounts that
//      logged in with the old password flow before this deploy stay signed
//      in until their token naturally expires (max 7 days). See
//      docs/AUTH.md for the deprecation plan; nothing here deletes this
//      branch, it is exactly the pre-Phase-3 implementation, unmodified.
//
// Both branches additionally reject a user whose account status isn't
// ACTIVE (§13 — the database is the source of truth for account status,
// checked here regardless of which credential authenticated the request).
export async function requireAuth(req, res, next) {
  const sessionToken = req.signedCookies?.[SESSION_COOKIE_NAME]
  if (sessionToken) {
    const session = await validateSessionToken(sessionToken)
    if (session) {
      const user = await findUserById(session.user_id)
      if (user && user.status === 'ACTIVE') {
        req.user = user
        // Phase 6 — kept alongside req.user so step-up grants (FK'd to
        // sessions.id) and the MFA-freshness gates below have the exact
        // session row without a second query: validateSessionToken already
        // SELECT *'d it, so mfa_verified_at comes back for free.
        req.session = session
        req.authMethod = 'session'
        req.mfaVerified = computeMfaVerified(session)
        return next()
      }
      logger.warn('Session cookie present but invalid (user missing or not active)')
      return res.status(401).json({ error: 'Invalid session.' })
    }
    // A cookie was sent but doesn't map to any active session (expired/
    // revoked/never existed) — treated as an authentication failure rather
    // than silently falling through to the JWT check, since a present-but-
    // invalid cookie is a clearer signal than "no credential at all".
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const payload = verifyToken(token)
    const user = await findUserById(payload.id)
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Invalid session.' })
    }
    req.user = user
    // Phase 6 — the legacy JWT bearer path has no backing `sessions` row
    // (see docs/MFA.md), so there is nowhere to read/write mfa_verified_at.
    // Always treated as MFA-not-verified, with no path to become verified —
    // a privileged account authenticated this way must re-login via OTP
    // (which does create a real session) before it can pass an MFA gate.
    req.session = null
    req.authMethod = 'jwt'
    req.mfaVerified = false
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `${role} access required.` })
    }
    next()
  }
}

// Finer-grained than requireRole('staff'): also checks the user's staff_role
// (super_admin | admin | canteen_staff, resolved via requireAuth's
// findUserById JOIN — see user.model.js). A staff row with no staff_role_id
// assigned resolves staff_role = null, which never matches any allowedNames
// list, so it is safely denied rather than crashing.
export function requireStaffRole(...allowedNames) {
  return (req, res, next) => {
    if (req.user?.role !== 'staff' || !allowedNames.includes(req.user?.staff_role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    }
    // Phase 6 — MFA is mandatory for super_admin unconditionally, regardless
    // of which other staff_role names this particular route also allows
    // (e.g. requireStaffRole('super_admin', 'admin')) — gated on the
    // RESOLVED user's own staff_role, not on whether 'super_admin' happens
    // to appear in allowedNames, so an 'admin' caller passing through the
    // same mixed-allow route is never affected.
    if (req.user.staff_role === 'super_admin' && !req.mfaVerified) {
      return respondMfaRequired(res)
    }
    // SUPER_ADMIN Identity & Secure Provisioning feature — the bootstrap
    // Super Admin (and any staff account an admin resets via a temporary
    // credential) must change their password before touching ANY other
    // staff-privileged route. Enforced here, not just the client redirect
    // in roleRedirect.model.js#getPostLoginPath — POST /auth/change-password
    // itself is a plain requireAuth endpoint (not behind requireStaffRole),
    // so this can never block the one route that's supposed to fix it.
    if (req.user.force_password_change) {
      return res.status(403).json({ code: 'FORCE_PASSWORD_CHANGE_REQUIRED', error: 'You must change your password before continuing.' })
    }
    next()
  }
}

// Global (this file's isSuperAdmin condition) — every requireMatchScorer call
// site (matchScorerAccess.js) reuses this exact predicate so the super-admin
// bypass is defined once, not re-implemented per gate.
export function isSuperAdminUser(user) {
  return user?.role === 'staff' && user?.staff_role === 'super_admin'
}

// U4 — the umpire's own self-service reads (available matches, my
// assignments, my profile). Deliberately NO super-admin bypass, unlike
// requireScorer/requireMatchScorer: "what are MY assignments/my profile"
// isn't a meaningful question for a staff account that isn't an umpire —
// this gate is about umpire identity, not scoring capability.
export async function requireApprovedUmpire(req, res, next) {
  try {
    if (await isApprovedUmpireUser(req.user)) return next()
  } catch (err) {
    return next(err)
  }
  return res.status(403).json({ error: 'Approved umpire access required.' })
}
