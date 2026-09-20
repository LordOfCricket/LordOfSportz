import bcrypt from 'bcryptjs'
import { detectIdentifierType, normalizeIdentifier, maskIdentifier } from '../domain/otpAuth/otp.js'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as CODES } from '../domain/otpAuth/errors.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as ACCOUNT_CODES } from '../domain/accountCreation/errors.js'
import { requiredText } from '../domain/accountCreation/validation.js'
import * as otpService from './otp.service.js'
import { createSessionForUser, revokeAllSessionsForUser } from './session.service.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { findUserByIdentifier, createUserFromOtp, updateUser } from '../models/user.model.js'
import { createUmpireRequest, findLatestUmpireRequestForUser } from '../models/umpireRequest.model.js'
import { logger } from '../utils/logger.js'

function resolveIdentifier(rawIdentifier) {
  const identifierType = detectIdentifierType(rawIdentifier)
  if (!identifierType) {
    throw new OtpAuthError(CODES.INVALID_IDENTIFIER, 'Enter a valid email address or phone number.')
  }
  return { identifier: normalizeIdentifier(rawIdentifier, identifierType), identifierType }
}

export async function requestLoginOtp(rawIdentifier) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)
  await otpService.requestOtp({ identifier, identifierType })
  return { identifier, identifierType }
}

// Phase 4 — POST /auth/register/player and /auth/register/umpire. Unlike
// requestLoginOtp, this DOES reveal whether the identifier is already
// registered (409) — the brief requires it (no generic role-selection
// registration endpoint; a genuinely new registration path is expected to
// tell the applicant to sign in instead rather than silently OTP'ing them
// into their existing account). `purpose` is 'REGISTER_PLAYER' or
// 'REGISTER_UMPIRE'; `name` is staged in otp_codes.metadata and read back by
// verifyLoginOtp once the code is confirmed, since the account itself isn't
// created until then.
export async function requestRegistrationOtp(name, rawIdentifier, purpose) {
  const nameResult = requiredText(name, 100)
  if (nameResult.error) {
    throw new AccountCreationError(ACCOUNT_CODES.VALIDATION_ERROR, 'Name is required.')
  }

  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const existing = await findUserByIdentifier(identifier, identifierType)
  if (existing) {
    throw new AccountCreationError(
      ACCOUNT_CODES.IDENTIFIER_ALREADY_REGISTERED,
      'An account already exists for this email or phone number. Try signing in instead.'
    )
  }

  await otpService.requestOtp({ identifier, identifierType, purpose, metadata: { name: nameResult.value } })
  return { identifier, identifierType }
}

// Phase 3 — TRANSITIONAL compatibility adapter (see docs/AUTH.md "Legacy
// JWT migration strategy" and the brief's §16/§23-17): a successful OTP
// verification finds the existing account for this identifier, or creates
// a bare one if none exists — matching today's password-signup default
// exactly (role='user', not yet chosen). This unifies "login" and "signup"
// into the one entry point the brief requires (no separate signup form),
// without inventing a new role model — the returned user goes through the
// EXACT SAME existing post-auth role-selection flow
// (roleRedirect.model.js) an old password signup already used. Phase 5
// (RBAC redesign) is the right place to revisit whether find-or-create
// should still be this permissive once GROUND_OWNER/STAFF/SUPER_ADMIN have
// their own dedicated provisioning paths — not this phase.
export async function verifyLoginOtp({ identifier: rawIdentifier, code, ipAddress, userAgent }) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  // otpRow.purpose tells us which of the three flows this code was
  // requested for — LOGIN/REGISTER_PLAYER/REGISTER_UMPIRE all funnel
  // through this one verify endpoint (the brief explicitly forbids a
  // separate generic role-selection endpoint), so the branch happens here,
  // after the code itself is confirmed, not before.
  const otpRow = await otpService.verifyOtp({ identifier, identifierType, code })

  let user = await findUserByIdentifier(identifier, identifierType)
  let isNewRegistration = false

  if (otpRow.purpose === 'REGISTER_PLAYER' || otpRow.purpose === 'REGISTER_UMPIRE') {
    if (!user) {
      const stagedName = otpRow.metadata?.name || (otpRow.purpose === 'REGISTER_UMPIRE' ? 'New Umpire' : 'New Player')
      const playerType = otpRow.purpose === 'REGISTER_UMPIRE' ? 'umpire' : 'team_player'
      user = await createUserFromOtp({ identifier, identifierType, name: stagedName, role: 'player', playerType })
      isNewRegistration = true
      logger.info('New account registered via OTP', { userId: user.id, identifierType, purpose: otpRow.purpose })
    } else {
      // requestRegistrationOtp already rejected this identifier if it was
      // registered at request time — this only fires if a second account
      // was created for the same identifier in the gap between that check
      // and this verification (e.g. via a concurrent login). Rather than
      // fail here, fall back to treating it as an ordinary login for the
      // account that now exists.
      logger.warn('Registration OTP verified but identifier was already claimed by the time of verification — logging in instead', {
        userId: user.id,
        purpose: otpRow.purpose,
      })
    }

    if (otpRow.purpose === 'REGISTER_UMPIRE') {
      // Exactly auth.controller.js#selectPlayerType's existing umpire-request
      // rule (create a pending request unless the latest one is already
      // pending/approved) — idempotent, so safe whether `user` was just
      // created above or already existed.
      const latest = await findLatestUmpireRequestForUser(user.id)
      if (!latest || latest.status === 'rejected') {
        await createUmpireRequest(user.id)
      }
    }
  } else if (!user) {
    // LOGIN purpose — Phase 3's original permissive find-or-create-bare-user
    // compatibility adapter, unchanged.
    user = await createUserFromOtp({ identifier, identifierType, name: 'New User' })
    logger.info('New user created via OTP login', { userId: user.id, identifierType })
  }

  if (user.status !== 'ACTIVE') {
    logger.warn('Login blocked: account not active', { userId: user.id, status: user.status })
    throw new OtpAuthError(CODES.ACCOUNT_NOT_ACTIVE, 'This account is not able to sign in right now. Contact support.')
  }

  if (isNewRegistration) {
    await recordEvent(
      otpRow.purpose === 'REGISTER_UMPIRE' ? ACCOUNT_AUDIT_EVENTS.UMPIRE_REGISTERED : ACCOUNT_AUDIT_EVENTS.PLAYER_REGISTERED,
      { targetUserId: user.id, metadata: { identifierType } }
    )
  }

  const { rawToken, expiresAt } = await createSessionForUser(user.id, { ipAddress, userAgent })
  logger.info('Authentication succeeded (OTP)', { userId: user.id })

  // SUPER_ADMIN Identity & Secure Provisioning feature — "Admin login" is
  // explicitly one of the brief's auditable events. Staff accounts don't
  // normally OTP-login (password is the primary staff credential), but
  // this path is reachable (e.g. a legacy/pre-password staff row), so it's
  // covered here too, not just loginWithPassword.
  if (user.role === 'staff') {
    await recordEvent(ACCOUNT_AUDIT_EVENTS.ADMIN_LOGIN, { actorUserId: user.id, targetUserId: user.id, metadata: { staffRole: user.staff_role, via: 'otp' } })
  }

  const { password_hash, temp_password_hash, ...publicUser } = user
  return { user: publicUser, sessionToken: rawToken, sessionExpiresAt: expiresAt }
}

// Auth Enhancement — the second credential type for the same unified login.
// Deliberately mirrors verifyLoginOtp's shape as closely as the different
// credential allows: same identifier resolution, same ACCOUNT_NOT_ACTIVE
// check, same createSessionForUser call, same { user, sessionToken,
// sessionExpiresAt } return shape — so auth.controller.js's caller treats
// both paths identically (set the same cookie, return the same user shape).
//
// Unlike OTP, this does NOT find-or-create — a password can only
// authenticate an account that already has one (see password.js's header:
// only 6 accounts in this database have ever had one, all pre-existing
// seed/dev accounts). No account is ever created by this function.
//
// Timing/enumeration: bcrypt.compare always runs, even when no user or no
// password_hash exists, against a fixed dummy hash — so "no such account",
// "account has no password set", and "wrong password" all take the same
// code path, the same approximate time, and produce the byte-identical
// generic INVALID_CREDENTIALS error. Never distinguished, by design (brief's
// explicit anti-enumeration requirement).
const DUMMY_HASH_FOR_TIMING_SAFETY = bcrypt.hashSync('not-a-real-password-used-only-for-constant-time-comparison', 10)

// SUPER_ADMIN Identity & Secure Provisioning feature — the submitted
// password may also match a still-valid, unexpired ADMIN-generated
// temporary credential (users.temp_password_hash/temp_password_expires_at
// — see services/adminPasswordRecovery.service.js). Only ever checked as a
// FALLBACK when the real password_hash doesn't match, and only while a
// live, unexpired temp credential actually exists — never widens what
// counts as a valid login beyond that.
async function tempCredentialMatches(user, password) {
  if (!user?.temp_password_hash || !user.temp_password_expires_at) return false
  if (new Date(user.temp_password_expires_at).getTime() <= Date.now()) return false
  return bcrypt.compare(typeof password === 'string' ? password : '', user.temp_password_hash)
}

export async function loginWithPassword({ identifier: rawIdentifier, password, ipAddress, userAgent }) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const user = await findUserByIdentifier(identifier, identifierType)
  const hashToCompare = user?.password_hash || DUMMY_HASH_FOR_TIMING_SAFETY
  const passwordMatches = await bcrypt.compare(typeof password === 'string' ? password : '', hashToCompare)
  const viaTempCredential = !passwordMatches && (await tempCredentialMatches(user, password))

  // FINAL AUDIT — adminPasswordRecovery.service.js#generateTemporaryCredential
  // ("compromised account" remediation, PRODUCTION_RECOVERY_RUNBOOK.md
  // §6.1) has always revoked every existing SESSION but never actually
  // touched password_hash, so the account's original password kept working
  // for a brand-new login the whole time a temp credential was pending —
  // the runbook's own claim ("the account cannot be used again until the
  // new temporary credential is exercised") was not actually true. Fixed by
  // rejecting a correct OLD password specifically while a real, unexpired
  // temp credential is outstanding — the temp-credential path above already
  // works and already forces a real password change on use, this just
  // closes the other door while that's the only door meant to be open.
  const hasPendingTempCredential = Boolean(
    user?.temp_password_hash && user.temp_password_expires_at && new Date(user.temp_password_expires_at).getTime() > Date.now(),
  )

  if (!user || !user.password_hash || (!passwordMatches && !viaTempCredential) || (passwordMatches && hasPendingTempCredential)) {
    logger.warn('Password login failed', { identifier: maskIdentifier(identifier, identifierType), identifierType })
    throw new OtpAuthError(CODES.INVALID_CREDENTIALS, 'Incorrect email/phone or password.')
  }

  if (user.status !== 'ACTIVE') {
    logger.warn('Password login blocked: account not active', { userId: user.id, status: user.status })
    throw new OtpAuthError(CODES.ACCOUNT_NOT_ACTIVE, 'This account is not able to sign in right now. Contact support.')
  }

  // Single-use, invalidated the instant it succeeds — never promoted into
  // being the permanent password (the user still lands on
  // force_password_change=true and must set a real one via
  // POST /auth/change-password before doing anything else on a staff route).
  if (viaTempCredential) {
    await updateUser(user.id, { temp_password_hash: null, temp_password_expires_at: null })
    await recordEvent(ACCOUNT_AUDIT_EVENTS.TEMPORARY_CREDENTIAL_USED, { targetUserId: user.id })
  }

  const { rawToken, expiresAt } = await createSessionForUser(user.id, { ipAddress, userAgent })
  logger.info('Authentication succeeded (password)', { userId: user.id, viaTempCredential })

  if (user.role === 'staff') {
    await recordEvent(ACCOUNT_AUDIT_EVENTS.ADMIN_LOGIN, { actorUserId: user.id, targetUserId: user.id, metadata: { staffRole: user.staff_role, via: 'password' } })
  }

  const { password_hash, temp_password_hash, ...publicUser } = user
  return { user: { ...publicUser, force_password_change: viaTempCredential ? true : user.force_password_change }, sessionToken: rawToken, sessionExpiresAt: expiresAt }
}

// Auth Enhancement — forgot-password step 1. Deliberately identical shape to
// requestLoginOtp: no existence check, no branching on whether the
// identifier has an account or a password already — otp.service.js#
// requestOtp itself doesn't check account existence either (see its own
// header), so the HTTP response is byte-identical whether or not this
// identifier is registered (§ anti-enumeration). purpose:'PASSWORD_RESET'
// keeps this OTP request/cooldown/invalidation fully independent of any
// pending LOGIN or REGISTER_* code for the same identifier (otp.service.js's
// existing purpose-scoping, unmodified).
export async function requestPasswordReset(rawIdentifier) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)
  await otpService.requestOtp({ identifier, identifierType, purpose: 'PASSWORD_RESET' })
  return { identifier, identifierType }
}

// Auth Enhancement — forgot-password step 2. Single call (code + new
// password together) rather than a separate "verify, then get a token, then
// set password" round trip — deliberately avoids inventing a second,
// parallel token system: otp.service.js#verifyOtp is already random
// (server-generated), short-lived (OTP_TTL_MINUTES), single-use (marks the
// row VERIFIED, replay-checked), server-validated, and never logged. See
// docs/AUTH.md for why this satisfies the brief's "reuse existing
// infrastructure unless a separate system is genuinely required" rule.
export async function resetPassword({ identifier: rawIdentifier, code, newPassword, confirmPassword }) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  if (newPassword !== confirmPassword) {
    throw new OtpAuthError(CODES.PASSWORD_MISMATCH, 'Passwords do not match.')
  }
  const policy = validatePasswordPolicy(newPassword)
  if (!policy.valid) {
    throw new OtpAuthError(CODES.PASSWORD_POLICY_VIOLATION, policy.reason)
  }

  // Validated BEFORE touching the OTP row on purpose — verifyOtp has real
  // side effects (increments attempts, marks VERIFIED/LOCKED), so a request
  // doomed by a bad password shouldn't burn the user's one valid code.
  const otpRow = await otpService.verifyOtp({ identifier, identifierType, code })

  // otp.service.js#verifyOtp checks the MOST RECENT code for this identifier
  // regardless of purpose (see its own comment) — the purpose-scoping lives
  // in requestOtp's invalidation, not here, so a still-valid LOGIN/REGISTER_*
  // code for the same identifier could otherwise satisfy this call. Reusing
  // CODES.INVALID_OTP's identical generic message for the mismatch, not a
  // new one — from the client's perspective this must be indistinguishable
  // from "wrong code".
  if (otpRow.purpose !== 'PASSWORD_RESET') {
    logger.warn('Password reset rejected: verified code was not requested for password reset', {
      identifier: maskIdentifier(identifier, identifierType),
      purpose: otpRow.purpose,
    })
    throw new OtpAuthError(CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  // otp.service.js#requestOtp never checks account existence (any validly-
  // shaped identifier can have a code sent to it and verified) — so a
  // correctly-verified code for an identifier with NO LOC account is a real,
  // reachable case here. Unlike verifyLoginOtp's find-or-create, this never
  // creates one — same generic message as an invalid code, never revealing
  // "no account exists for this identifier".
  const user = await findUserByIdentifier(identifier, identifierType)
  if (!user) {
    logger.warn('Password reset rejected: no account exists for this (OTP-verified) identifier', {
      identifier: maskIdentifier(identifier, identifierType),
    })
    throw new OtpAuthError(CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await updateUser(user.id, { password_hash: passwordHash })
  await revokeAllSessionsForUser(user.id)

  await recordEvent(ACCOUNT_AUDIT_EVENTS.PASSWORD_RESET, { targetUserId: user.id, metadata: { identifierType } })
  await recordEvent(ACCOUNT_AUDIT_EVENTS.SESSION_REVOKED_FOR_SECURITY_REASON, {
    targetUserId: user.id,
    metadata: { reason: 'password_reset' },
  })

  logger.info('Password reset succeeded', { userId: user.id })
  // Deliberately does NOT create a session — the brief's own flow diagram
  // ends reset at "Password reset successful" then a separate "Login" step,
  // not an auto-login. The user authenticates fresh via loginWithPassword.
  return { identifier, identifierType }
}
