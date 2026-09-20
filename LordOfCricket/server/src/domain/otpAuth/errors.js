// Phase 3 — structured OTP/session auth domain errors, same shape/convention
// as domain/booking/errors.js so errorHandler.js can treat them identically.
// Every message here is intentionally generic where account/OTP enumeration
// would otherwise be possible — see docs/AUTH.md.

export const OTP_AUTH_ERROR_CODES = Object.freeze({
  INVALID_IDENTIFIER: 'INVALID_IDENTIFIER',
  RESEND_COOLDOWN: 'RESEND_COOLDOWN',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_LOCKED: 'OTP_LOCKED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  SESSION_INVALID: 'SESSION_INVALID',
  // Password login/reset (Auth Enhancement) — same domain, same error
  // taxonomy as OTP auth rather than a second competing error framework.
  // INVALID_CREDENTIALS is deliberately the ONE code for both "no such
  // account" and "wrong password" (§ anti-enumeration) — see
  // otpAuth.service.js#loginWithPassword.
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  PASSWORD_POLICY_VIOLATION: 'PASSWORD_POLICY_VIOLATION',
  PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
})

export class OtpAuthError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'OtpAuthError'
    this.code = code
    this.details = details
  }
}

export const OTP_AUTH_ERROR_HTTP_STATUS = Object.freeze({
  [OTP_AUTH_ERROR_CODES.INVALID_IDENTIFIER]: 400,
  [OTP_AUTH_ERROR_CODES.RESEND_COOLDOWN]: 429,
  [OTP_AUTH_ERROR_CODES.TOO_MANY_REQUESTS]: 429,
  [OTP_AUTH_ERROR_CODES.INVALID_OTP]: 401,
  [OTP_AUTH_ERROR_CODES.OTP_EXPIRED]: 401,
  [OTP_AUTH_ERROR_CODES.OTP_LOCKED]: 401,
  [OTP_AUTH_ERROR_CODES.ACCOUNT_NOT_ACTIVE]: 403,
  [OTP_AUTH_ERROR_CODES.SESSION_INVALID]: 401,
  [OTP_AUTH_ERROR_CODES.INVALID_CREDENTIALS]: 401,
  [OTP_AUTH_ERROR_CODES.PASSWORD_POLICY_VIOLATION]: 400,
  [OTP_AUTH_ERROR_CODES.PASSWORD_MISMATCH]: 400,
})
