// New Signup Flow — a dedicated service (not folded into otpAuth.service.js)
// because this orchestration is genuinely different in shape from every
// function already there: two independent identifier verifications proven
// BEFORE a single account-creation call, rather than one identifier
// verified and consumed in the same request. Reuses the existing OTP/
// password/session/audit primitives throughout — no duplicate auth,
// verification, or hashing logic.
import bcrypt from 'bcryptjs'
import { detectIdentifierType, normalizeIdentifier, maskIdentifier } from '../domain/otpAuth/otp.js'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as OTP_CODES } from '../domain/otpAuth/errors.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'
import { requiredText, validateEmail, validatePhone } from '../domain/accountCreation/validation.js'
import * as otpService from './otp.service.js'
import { findMostRecentForIdentifier } from '../repositories/prisma/otpCode.prisma-repository.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { findUserByIdentifier, createUserFromSignup } from '../models/user.model.js'
import { createUmpireRequest } from '../models/umpireRequest.model.js'
import { logger } from '../utils/logger.js'

const SIGNUP_VERIFY_PURPOSE = 'SIGNUP_VERIFY'

// How long a completed email/phone verification stays usable as proof at
// the final create-account step — same "short-lived proof of an already-
// completed verification" shape as mfaState.service.js#getMfaVerifiedTtlMs
// and stepUp.service.js#getStepUpTtlMs (both live in their own service
// file, not a shared domain module — matched here). Bounds the real gap
// this two-phase design opens up that a single verify-and-create-together
// call wouldn't have: otp.service.js#requestOtp never checks account
// existence, so someone could complete email/phone verification, abandon
// the form, and — without a freshness bound — a DIFFERENT person could
// later submit create-account with that same (still-"VERIFIED") identifier
// and hijack it. 30 minutes is generous enough to fill out the rest of a
// signup form, short enough to close that window meaningfully.
const DEFAULT_SIGNUP_VERIFICATION_TTL_MINUTES = 30
function getSignupVerificationTtlMs() {
  return (Number(process.env.SIGNUP_VERIFICATION_TTL_MINUTES) || DEFAULT_SIGNUP_VERIFICATION_TTL_MINUTES) * 60 * 1000
}

function resolveIdentifier(rawIdentifier) {
  const identifierType = detectIdentifierType(rawIdentifier)
  if (!identifierType) {
    throw new OtpAuthError(OTP_CODES.INVALID_IDENTIFIER, 'Enter a valid email address or phone number.')
  }
  return { identifier: normalizeIdentifier(rawIdentifier, identifierType), identifierType }
}

// Step — "Send Verification Code" (email) / "Send OTP" (phone). One
// function for both: otp.service.js#requestOtp already branches on
// identifierType to pick the right provider (Twilio Verify for phone,
// SendGrid/console for email) — nothing signup-specific to fork on here.
// Reveals an already-registered identifier (409), matching
// otpAuthService.requestRegistrationOtp's existing, deliberate convention
// for registration flows (never done for login's own send-otp).
export async function requestSignupVerification(rawIdentifier) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const existing = await findUserByIdentifier(identifier, identifierType)
  if (existing) {
    throw new AccountCreationError(
      CODES.IDENTIFIER_ALREADY_REGISTERED,
      'An account already exists for this email or phone number. Try signing in instead.'
    )
  }

  await otpService.requestOtp({ identifier, identifierType, purpose: SIGNUP_VERIFY_PURPOSE })
  return { identifier, identifierType }
}

// Step — "Verify Email" / "Verify Phone". Same generic-error/purpose-check
// shape otpAuthService.resetPassword already established: verify via the
// shared otp.service.js#verifyOtp, then confirm the verified row was
// actually requested for THIS purpose (a still-valid LOGIN/REGISTER_*/
// PASSWORD_RESET code for the same identifier must not satisfy this).
export async function verifySignupIdentifier({ identifier: rawIdentifier, code }) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const otpRow = await otpService.verifyOtp({ identifier, identifierType, code })

  if (otpRow.purpose !== SIGNUP_VERIFY_PURPOSE) {
    logger.warn('Signup verification rejected: verified code was not requested for signup', {
      identifier: maskIdentifier(identifier, identifierType),
      purpose: otpRow.purpose,
    })
    throw new OtpAuthError(OTP_CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  return { identifier, identifierType, verified: true }
}

// Re-checked here (not just trusted from the earlier verify step) — this is
// the actual backend enforcement the brief's "a malicious user must not be
// able to bypass verification by directly calling the signup API" rule
// requires. Fresh, VERIFIED, SIGNUP_VERIFY-purpose, within the TTL window.
async function assertVerified(identifier) {
  const row = await findMostRecentForIdentifier(identifier, SIGNUP_VERIFY_PURPOSE)
  if (!row || row.status !== 'VERIFIED' || !row.verified_at) return false
  const ageMs = Date.now() - new Date(row.verified_at).getTime()
  return ageMs >= 0 && ageMs <= getSignupVerificationTtlMs()
}

// Final step — "Create Account". Only ever succeeds when every one of the
// brief's §8 conditions holds; the backend is the sole source of truth for
// all of them, never the frontend's own step-tracking. No session is
// created — the brief's own flow diagram ends signup at "Account created"
// then a separate "Login" step, matching resetPassword's identical
// no-auto-login precedent.
export async function createAccount({ firstName, middleName, lastName, accountType, email, phone, password, confirmPassword }) {
  const first = requiredText(firstName, 50)
  if (first.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'First name is required.')
  const middle = requiredText(middleName, 50)
  if (middle.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Middle name is required.')
  const last = requiredText(lastName, 50)
  if (last.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Last name is required.')

  // Account Type radio -> the EXISTING role/player_type representation
  // (role='player' either way) — never a new top-level role string. Exactly
  // the same mapping requestRegistrationOtp's REGISTER_PLAYER/
  // REGISTER_UMPIRE purposes already use.
  if (accountType !== 'PLAYER' && accountType !== 'UMPIRE') {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Select Player or Umpire.')
  }
  const playerType = accountType === 'UMPIRE' ? 'umpire' : 'team_player'

  const emailResult = validateEmail(email)
  if (emailResult.error || !emailResult.value) {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'A valid email address is required.')
  }
  const normalizedEmail = emailResult.value.toLowerCase()

  const phoneResult = validatePhone(phone)
  if (phoneResult.error || !phoneResult.value) {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'A valid phone number is required.')
  }
  const normalizedPhone = phoneResult.value

  if (password !== confirmPassword) {
    throw new OtpAuthError(OTP_CODES.PASSWORD_MISMATCH, 'Passwords do not match.')
  }
  const policy = validatePasswordPolicy(password)
  if (!policy.valid) {
    throw new OtpAuthError(OTP_CODES.PASSWORD_POLICY_VIOLATION, policy.reason)
  }

  // Defense in depth — requestSignupVerification already checked this at
  // send-code time, but time passed since then (this is exactly what the
  // verification-freshness window above also bounds).
  if (await findUserByIdentifier(normalizedEmail, 'EMAIL')) {
    throw new AccountCreationError(CODES.IDENTIFIER_ALREADY_REGISTERED, 'An account already exists for this email address.')
  }
  if (await findUserByIdentifier(normalizedPhone, 'PHONE')) {
    throw new AccountCreationError(CODES.IDENTIFIER_ALREADY_REGISTERED, 'An account already exists for this phone number.')
  }

  if (!(await assertVerified(normalizedEmail))) {
    throw new AccountCreationError(CODES.EMAIL_NOT_VERIFIED, 'Please verify your email address before creating your account.')
  }
  if (!(await assertVerified(normalizedPhone))) {
    throw new AccountCreationError(CODES.PHONE_NOT_VERIFIED, 'Please verify your phone number before creating your account.')
  }

  const name = `${first.value} ${middle.value} ${last.value}`
  const passwordHash = await bcrypt.hash(password, 10)

  const user = await createUserFromSignup({
    name,
    email: normalizedEmail,
    phone: normalizedPhone,
    passwordHash,
    role: 'player',
    playerType,
  })

  if (accountType === 'UMPIRE') {
    // Matches selectPlayerType('umpire')/verifyLoginOtp's existing
    // auto-pending-request behavior exactly — a brand-new account never has
    // a prior umpire_requests row, so this is unconditional here (unlike
    // those two callers, which also handle an existing account switching
    // into umpire).
    await createUmpireRequest(user.id)
  }

  await recordEvent(accountType === 'UMPIRE' ? ACCOUNT_AUDIT_EVENTS.UMPIRE_REGISTERED : ACCOUNT_AUDIT_EVENTS.PLAYER_REGISTERED, {
    targetUserId: user.id,
    metadata: { via: 'signup_form' },
  })

  logger.info('New account created via signup form', { userId: user.id, accountType })

  const { password_hash, ...publicUser } = user
  return { user: publicUser }
}
