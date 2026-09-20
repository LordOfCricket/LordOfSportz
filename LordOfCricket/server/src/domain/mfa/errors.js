// Phase 6 — structured MFA/WebAuthn/step-up domain errors, same shape as
// domain/otpAuth/errors.js and domain/accountCreation/errors.js so
// errorHandler.js treats them identically.

export const MFA_ERROR_CODES = Object.freeze({
  MFA_REQUIRED: 'MFA_REQUIRED',
  STEP_UP_REQUIRED: 'STEP_UP_REQUIRED',
  CHALLENGE_INVALID: 'CHALLENGE_INVALID',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  LAST_FACTOR_REMOVAL_BLOCKED: 'LAST_FACTOR_REMOVAL_BLOCKED',
  TOTP_NOT_ENROLLED: 'TOTP_NOT_ENROLLED',
  MFA_DISABLE_NOT_ALLOWED: 'MFA_DISABLE_NOT_ALLOWED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
})

export class MfaError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'MfaError'
    this.code = code
    this.details = details
  }
}

export const MFA_ERROR_HTTP_STATUS = Object.freeze({
  [MFA_ERROR_CODES.MFA_REQUIRED]: 403,
  [MFA_ERROR_CODES.STEP_UP_REQUIRED]: 403,
  [MFA_ERROR_CODES.CHALLENGE_INVALID]: 400,
  [MFA_ERROR_CODES.VERIFICATION_FAILED]: 401,
  [MFA_ERROR_CODES.CREDENTIAL_NOT_FOUND]: 404,
  [MFA_ERROR_CODES.LAST_FACTOR_REMOVAL_BLOCKED]: 409,
  [MFA_ERROR_CODES.TOTP_NOT_ENROLLED]: 400,
  [MFA_ERROR_CODES.MFA_DISABLE_NOT_ALLOWED]: 403,
  [MFA_ERROR_CODES.VALIDATION_ERROR]: 400,
})
