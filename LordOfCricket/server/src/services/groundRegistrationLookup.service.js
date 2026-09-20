// Ground Registration feature — non-logged-in "find my registrations" (brief
// §22): a visitor without their Registration ID handy but with the email/
// phone they registered proves control of that identifier via OTP (reusing
// otp.service.js, same as every other OTP flow in this codebase) before
// seeing anything back. No account/login required — this deliberately does
// NOT touch users/sessions at all, unlike every auth-adjacent OTP flow.
import { detectIdentifierType, normalizeIdentifier } from '../domain/otpAuth/otp.js'
import { OtpAuthError, OTP_AUTH_ERROR_CODES as OTP_CODES } from '../domain/otpAuth/errors.js'
import * as otpService from './otp.service.js'
import * as requestModel from '../models/groundOwnerRequest.model.js'

const GROUND_REGISTRATION_LOOKUP_PURPOSE = 'GROUND_REGISTRATION_LOOKUP'

function resolveIdentifier(rawIdentifier) {
  const identifierType = detectIdentifierType(rawIdentifier)
  if (!identifierType) {
    throw new OtpAuthError(OTP_CODES.INVALID_IDENTIFIER, 'Enter a valid email address or phone number.')
  }
  return { identifier: normalizeIdentifier(rawIdentifier, identifierType), identifierType }
}

// Anti-enumeration — identical shape/response whether or not any
// registration exists for this identifier (otp.service.js#requestOtp never
// checks existence either, same as requestLoginOtp's own convention).
export async function requestLookupCode(rawIdentifier) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)
  await otpService.requestOtp({ identifier, identifierType, purpose: GROUND_REGISTRATION_LOOKUP_PURPOSE })
}

// Same safe-fields-only shape as getPublicStatus (groundOwnerRequest.service.js)
// — never reviewed_by, internal id, or the other contact method.
function serializeForLookup(row) {
  return {
    publicRequestId: row.public_request_id,
    groundName: row.ground_name,
    status: row.status,
    rejectionReason: row.status === 'REJECTED' ? row.rejection_reason : null,
    moreInfoNotes: row.status === 'MORE_INFORMATION_REQUIRED' ? row.more_info_notes : null,
    submittedAt: row.created_at,
  }
}

export async function verifyLookupAndList(rawIdentifier, code) {
  const { identifier, identifierType } = resolveIdentifier(rawIdentifier)

  const otpRow = await otpService.verifyOtp({ identifier, identifierType, code })
  if (otpRow.purpose !== GROUND_REGISTRATION_LOOKUP_PURPOSE) {
    throw new OtpAuthError(OTP_CODES.INVALID_OTP, 'Invalid or expired code.')
  }

  const requests = identifierType === 'EMAIL' ? await requestModel.findByApplicantEmail(identifier) : await requestModel.findByApplicantPhone(identifier)
  return requests.map(serializeForLookup)
}
