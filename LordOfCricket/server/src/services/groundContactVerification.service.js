// Ground Registration feature — lets an authenticated Ground Owner add and
// verify an email/phone their account is missing, reusing the exact same
// OTP primitive every other verification flow in this codebase uses
// (otp.service.js). Only reached when the registration wizard finds
// req.user.email or req.user.phone empty — the common case (an account
// already has both, from the New Signup Flow's own dual-verification
// requirement) needs none of this; the wizard just displays "✓ Verified"
// for whichever of the two is already present. See signup.service.js for
// the sibling two-identifier verification flow this mirrors.
import { detectIdentifierType, normalizeIdentifier } from '../domain/otpAuth/otp.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as OTP_CODES } from '../domain/otpAuth/errors.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'
import * as otpService from './otp.service.js'
import { findUserByIdentifier, updateUser } from '../models/user.model.js'
import { logger } from '../utils/logger.js'

const GROUND_CONTACT_VERIFY_PURPOSE = 'GROUND_CONTACT_VERIFY'

function resolveIdentifier(rawIdentifier) {
  const identifierType = detectIdentifierType(rawIdentifier)
  if (!identifierType) {
    throw new OtpAuthError(OTP_CODES.INVALID_IDENTIFIER, 'Enter a valid email address or phone number.')
  }
  return { identifier: normalizeIdentifier(rawIdentifier, identifierType), identifierType }
}

export async function requestContactVerification(user, rawIdentifier) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const existing = await findUserByIdentifier(identifier, identifierType)
  if (existing && existing.id !== user.id) {
    throw new AccountCreationError(CODES.IDENTIFIER_ALREADY_REGISTERED, 'This email or phone number is already associated with a different account.')
  }

  await otpService.requestOtp({ identifier, identifierType, purpose: GROUND_CONTACT_VERIFY_PURPOSE })
  return { identifier, identifierType }
}

// Single atomic step (verify + persist), unlike signup's two-phase verify-
// then-create-account — there's no later step this proof needs to survive
// until, so no separate freshness window to enforce beyond what
// otp.service.js#verifyOtp already guarantees (expiry/attempts/replay).
export async function verifyContactVerification(user, rawIdentifier, code) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const otpRow = await otpService.verifyOtp({ identifier, identifierType, code })
  if (otpRow.purpose !== GROUND_CONTACT_VERIFY_PURPOSE) {
    throw new OtpAuthError(OTP_CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  const field = identifierType === 'EMAIL' ? 'email' : 'phone'
  const updated = await updateUser(user.id, { [field]: identifier })
  logger.info('Ground contact verification succeeded', { userId: user.id, identifierType })

  const { password_hash, ...publicUser } = updated
  return publicUser
}
