// Structured domain errors for match feedback, same shape/convention as
// domain/scoring/errors.js, domain/booking/errors.js, domain/umpireAssignment/errors.js.

export const FEEDBACK_ERROR_CODES = Object.freeze({
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_NOT_ELIGIBLE: 'MATCH_NOT_ELIGIBLE',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_UMPIRE: 'INVALID_UMPIRE',
  INVALID_RATING: 'INVALID_RATING',
  EMPTY_SUBMISSION: 'EMPTY_SUBMISSION',
})

export class FeedbackError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'FeedbackError'
    this.code = code
    this.details = details
  }
}

export const FEEDBACK_ERROR_HTTP_STATUS = Object.freeze({
  [FEEDBACK_ERROR_CODES.MATCH_NOT_FOUND]: 404,
  [FEEDBACK_ERROR_CODES.MATCH_NOT_ELIGIBLE]: 409,
  [FEEDBACK_ERROR_CODES.NOT_ELIGIBLE]: 403,
  [FEEDBACK_ERROR_CODES.ALREADY_SUBMITTED]: 409,
  [FEEDBACK_ERROR_CODES.INVALID_CATEGORY]: 403,
  [FEEDBACK_ERROR_CODES.INVALID_UMPIRE]: 403,
  [FEEDBACK_ERROR_CODES.INVALID_RATING]: 400,
  [FEEDBACK_ERROR_CODES.EMPTY_SUBMISSION]: 400,
})
