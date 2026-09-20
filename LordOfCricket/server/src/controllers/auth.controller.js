import { updateUser } from '../models/user.model.js'
import { createUmpireRequest, findLatestUmpireRequestForUser } from '../models/umpireRequest.model.js'
import * as otpAuthService from '../services/otpAuth.service.js'
import { revokeSession } from '../services/session.service.js'
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from '../middlewares/session.js'
import { OtpAuthError } from '../domain/otpAuth/errors.js'
import { hasAnyActiveFactor, isSuperAdmin } from '../services/mfaState.service.js'
import { logger } from '../utils/logger.js'

// Phase 8 — the legacy email+password `signup`/`login` handlers (and the
// `POST /auth/signup`/`POST /auth/login` routes that called them) were
// removed here: a full dependency audit found zero reachable frontend UI
// callers (no component destructures `login`/`signup` from `useAuth()`,
// confirmed by grep) — OTP has been the only reachable login/signup surface
// since Phase 3, and this initiative never had real production users on the
// password path to migrate. See docs/AUTH.md's "Legacy JWT" section for the
// full before/after. `signToken`/`verifyToken` (utils/jwt.js) and
// `requireAuth`'s JWT-bearer branch are NOT removed — see that same doc
// section for why (the integration test suite mints JWTs directly as an
// auth-fixture shortcut, independent of the now-removed login route).

// Phase 6 — `mfa` is a NEW top-level key alongside the unchanged `user` key
// (never touching req.user's own shape, which 67+ call sites depend on).
// `enrolled` needs one extra query (hasAnyActiveFactor) — acceptable here:
// this is a low-frequency, UI-driving endpoint (called once per app mount),
// not a hot authorization-check path like requireAuth.
export async function me(req, res, next) {
  try {
    const enrolled = await hasAnyActiveFactor(req.user.id)
    res.json({
      user: req.user,
      mfa: {
        // Only reflects Super Admin here — resolving "is this user a Ground
        // Owner" needs a ground_users query this low-frequency-but-always-
        // called endpoint shouldn't pay on every mount. The frontend
        // already makes an equivalent live call (fetchMyGrounds, via
        // RequireGroundOwner) to determine ground ownership for routing;
        // combining that with `verified` below is sufficient to gate the
        // UI, and every actual privileged ROUTE independently enforces the
        // real requirement server-side regardless of what this flag says.
        enrolled,
        required: isSuperAdmin(req.user),
        verified: Boolean(req.mfaVerified),
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function selectRole(req, res, next) {
  try {
    const { role } = req.body
    // 'staff' is deliberately not selectable here — staff accounts are only
    // ever created via the Super Admin "Create Staff" flow (staff.controller.js).
    if (role !== 'player') {
      return res.status(400).json({ message: "role must be 'player'" })
    }

    const user = await updateUser(req.user.id, { role })
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

// Phase 3 — unified OTP login. `identifier` is whatever the user typed into
// the single email-or-phone field; requestLoginOtp figures out which it is.
// Never reveals whether an account exists for it (§7/§17 anti-enumeration)
// — the response is identical whether this is someone's first time or
// their hundredth.
export async function sendOtp(req, res, next) {
  try {
    const { identifier } = req.body
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required.' })
    }
    await otpAuthService.requestLoginOtp(identifier)
    res.json({ message: 'If that email or phone number is valid, a code has been sent.' })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}

// Phase 4 — public self-registration for Player/Umpire. Unlike sendOtp,
// this DOES reveal an already-registered identifier (409) — see
// otpAuthService.requestRegistrationOtp's own comment for why. The account
// itself isn't created here; it's created on successful verification (the
// existing POST /auth/verify-otp below, unchanged path), once the code is
// confirmed — see otpAuthService.verifyLoginOtp's purpose-branching.
export async function registerPlayer(req, res, next) {
  try {
    const { name, identifier } = req.body
    if (!name || !identifier) {
      return res.status(400).json({ message: 'name and identifier are required.' })
    }
    await otpAuthService.requestRegistrationOtp(name, identifier, 'REGISTER_PLAYER')
    res.json({ message: 'If that email or phone number is available, a verification code has been sent.' })
  } catch (err) {
    next(err)
  }
}

// Umpire registration is otherwise identical to Player registration —
// player_type is set from the OTP purpose at verification time
// (otpAuthService.verifyLoginOtp), which also auto-creates the pending
// umpire_requests row, matching selectPlayerType('umpire')'s existing
// behavior exactly.
export async function registerUmpire(req, res, next) {
  try {
    const { name, identifier } = req.body
    if (!name || !identifier) {
      return res.status(400).json({ message: 'name and identifier are required.' })
    }
    await otpAuthService.requestRegistrationOtp(name, identifier, 'REGISTER_UMPIRE')
    res.json({ message: 'If that email or phone number is available, a verification code has been sent.' })
  } catch (err) {
    next(err)
  }
}

export async function verifyOtpAndLogin(req, res, next) {
  try {
    const { identifier, code } = req.body
    if (!identifier || !code) {
      return res.status(400).json({ message: 'identifier and code are required.' })
    }

    const { user, sessionToken, sessionExpiresAt } = await otpAuthService.verifyLoginOtp({
      identifier,
      code,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })

    setSessionCookie(res, sessionToken, sessionExpiresAt)
    res.json({ user })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}

// Auth Enhancement — the second credential type for the same unified login
// (email/phone + OTP, OR email/phone + password). Deliberately mirrors
// verifyOtpAndLogin above line for line: same body-shape validation, same
// setSessionCookie call, same { user } response — the frontend/AuthContext
// treats a password login exactly like an OTP one once this responds.
// otpAuthService.loginWithPassword never reveals whether the identifier or
// the password was wrong (single generic error either way).
export async function loginWithPassword(req, res, next) {
  try {
    const { identifier, password } = req.body
    if (!identifier || typeof password !== 'string') {
      return res.status(400).json({ message: 'identifier and password are required.' })
    }

    const { user, sessionToken, sessionExpiresAt } = await otpAuthService.loginWithPassword({
      identifier,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })

    setSessionCookie(res, sessionToken, sessionExpiresAt)
    res.json({ user })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}

// Auth Enhancement — forgot-password step 1. Same anti-enumeration shape as
// sendOtp above (identical generic response regardless of whether the
// identifier is registered) — requestPasswordReset itself never checks
// account existence either, for the same reason.
export async function forgotPassword(req, res, next) {
  try {
    const { identifier } = req.body
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required.' })
    }
    await otpAuthService.requestPasswordReset(identifier)
    res.json({ message: 'If that email or phone number is valid, a reset code has been sent.' })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}

// Auth Enhancement — forgot-password step 2. code + newPassword +
// confirmPassword all arrive together (see otpAuthService.resetPassword's
// own comment on why this is one call, not a separate token exchange).
// Never auto-logs in — the frontend routes back to the login screen on
// success, matching the brief's own flow diagram.
export async function resetPassword(req, res, next) {
  try {
    const { identifier, code, newPassword, confirmPassword } = req.body
    if (!identifier || !code || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      return res.status(400).json({ message: 'identifier, code, newPassword, and confirmPassword are required.' })
    }
    await otpAuthService.resetPassword({ identifier, code, newPassword, confirmPassword })
    res.json({ message: 'Password reset successful. You can now log in with your new password.' })
  } catch (err) {
    if (err instanceof OtpAuthError) return next(err)
    next(err)
  }
}

export async function logout(req, res) {
  const sessionToken = req.signedCookies?.[SESSION_COOKIE_NAME]
  if (sessionToken) {
    try {
      await revokeSession(sessionToken)
    } catch (err) {
      logger.error('Failed to revoke session on logout', { error: err.message })
    }
  }
  clearSessionCookie(res)
  res.json({ message: 'Logged out.' })
}

export async function selectPlayerType(req, res, next) {
  try {
    const { playerType } = req.body
    if (!['team_player', 'umpire'].includes(playerType)) {
      return res.status(400).json({ message: "playerType must be 'team_player' or 'umpire'" })
    }
    if (req.user.role !== 'player') {
      return res.status(403).json({ message: 'Only players can select a player type.' })
    }

    const user = await updateUser(req.user.id, { player_type: playerType })

    if (playerType === 'umpire') {
      const latest = await findLatestUmpireRequestForUser(req.user.id)
      if (!latest || latest.status === 'rejected') {
        await createUmpireRequest(req.user.id)
      }
    }

    res.json({ user })
  } catch (err) {
    next(err)
  }
}
