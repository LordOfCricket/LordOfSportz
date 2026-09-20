// Phase 4 — structured account-creation/onboarding domain errors, same
// shape/convention as domain/otpAuth/errors.js and domain/booking/errors.js.

export const ACCOUNT_CREATION_ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  IDENTIFIER_ALREADY_REGISTERED: 'IDENTIFIER_ALREADY_REGISTERED',
  REQUEST_NOT_FOUND: 'REQUEST_NOT_FOUND',
  REQUEST_NOT_ELIGIBLE: 'REQUEST_NOT_ELIGIBLE',
  STAFF_ROLE_INVALID: 'STAFF_ROLE_INVALID',
  // Phase 5 — granular Staff permissions.
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  MEMBERSHIP_ROLE_INVALID: 'MEMBERSHIP_ROLE_INVALID',
  PERMISSION_KEY_INVALID: 'PERMISSION_KEY_INVALID',
  PERMISSION_ALREADY_GRANTED: 'PERMISSION_ALREADY_GRANTED',
  PERMISSION_NOT_GRANTED: 'PERMISSION_NOT_GRANTED',
  // New Signup Flow — final account-creation guard. The frontend can only
  // ever reach these by calling create-account directly without completing
  // (or after losing) a verification the UI itself required first — the
  // backend is the actual source of truth per the brief's explicit "a
  // malicious user must not be able to bypass verification by directly
  // calling the signup API" rule.
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  PHONE_NOT_VERIFIED: 'PHONE_NOT_VERIFIED',
  // Ground Registration feature — a Ground Owner viewing/resubmitting a
  // request that isn't their own (submitted_by_user_id mismatch).
  REQUEST_NOT_OWNED: 'REQUEST_NOT_OWNED',
})

export class AccountCreationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AccountCreationError'
    this.code = code
    this.details = details
  }
}

export const ACCOUNT_CREATION_ERROR_HTTP_STATUS = Object.freeze({
  [ACCOUNT_CREATION_ERROR_CODES.VALIDATION_ERROR]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.IDENTIFIER_ALREADY_REGISTERED]: 409,
  [ACCOUNT_CREATION_ERROR_CODES.REQUEST_NOT_FOUND]: 404,
  [ACCOUNT_CREATION_ERROR_CODES.REQUEST_NOT_ELIGIBLE]: 409,
  [ACCOUNT_CREATION_ERROR_CODES.STAFF_ROLE_INVALID]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.MEMBERSHIP_NOT_FOUND]: 404,
  [ACCOUNT_CREATION_ERROR_CODES.MEMBERSHIP_ROLE_INVALID]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.PERMISSION_KEY_INVALID]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.PERMISSION_ALREADY_GRANTED]: 409,
  [ACCOUNT_CREATION_ERROR_CODES.PERMISSION_NOT_GRANTED]: 404,
  [ACCOUNT_CREATION_ERROR_CODES.EMAIL_NOT_VERIFIED]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.PHONE_NOT_VERIFIED]: 400,
  [ACCOUNT_CREATION_ERROR_CODES.REQUEST_NOT_OWNED]: 403,
})
