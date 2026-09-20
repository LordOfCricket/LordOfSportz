import { SCORING_ERROR_HTTP_STATUS } from '../domain/scoring/errors.js'
import { BOOKING_ERROR_HTTP_STATUS } from '../domain/booking/errors.js'
import { TOURNAMENT_ERROR_HTTP_STATUS } from '../domain/tournament/errors.js'
import { UMPIRE_ASSIGNMENT_ERROR_HTTP_STATUS } from '../domain/umpireAssignment/errors.js'
import { FEEDBACK_ERROR_HTTP_STATUS } from '../domain/feedback/errors.js'
import { OTP_AUTH_ERROR_HTTP_STATUS } from '../domain/otpAuth/errors.js'
import { ACCOUNT_CREATION_ERROR_HTTP_STATUS } from '../domain/accountCreation/errors.js'
import { MFA_ERROR_HTTP_STATUS } from '../domain/mfa/errors.js'
import { logger } from '../utils/logger.js'

export function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}`, requestId: req.id })
}

// Domain error classes that carry a structured `code` (see
// domain/scoring/errors.js, domain/booking/errors.js) so callers can branch
// on it instead of parsing message strings. Each domain owns its own
// code -> HTTP status map; this stays a thin dispatcher, not a place to add
// per-domain logic.
const DOMAIN_ERROR_HTTP_STATUS_MAPS = [
  SCORING_ERROR_HTTP_STATUS,
  BOOKING_ERROR_HTTP_STATUS,
  TOURNAMENT_ERROR_HTTP_STATUS,
  UMPIRE_ASSIGNMENT_ERROR_HTTP_STATUS,
  FEEDBACK_ERROR_HTTP_STATUS,
  OTP_AUTH_ERROR_HTTP_STATUS,
  ACCOUNT_CREATION_ERROR_HTTP_STATUS,
  MFA_ERROR_HTTP_STATUS,
]

// Phase 2A — Prisma errors (`PrismaClientKnownRequestError`) carry their own
// `code`/`P####` scheme, distinguishable from every domain error above by
// the `clientVersion` field Prisma always attaches (domain errors never
// have it, so this can never misfire on an existing domain error). No live
// route uses Prisma yet, but this keeps the same "never leak driver
// internals" guarantee the moment one does.
const PRISMA_ERROR_HTTP_STATUS = {
  P2002: 409, // unique constraint violation
  P2003: 409, // foreign key constraint violation
  P2025: 404, // record not found
}
const PRISMA_ERROR_MESSAGE = {
  P2002: 'A record with these details already exists.',
  P2003: 'This action references a record that no longer exists.',
  P2025: 'The requested record was not found.',
}

export function errorHandler(err, req, res, next) {
  if (err.clientVersion && err.code) {
    const status = PRISMA_ERROR_HTTP_STATUS[err.code] || 500
    const message = PRISMA_ERROR_MESSAGE[err.code] || 'A database error occurred.'
    if (status === 500) {
      logger.error('Unhandled Prisma error', { method: req.method, path: req.originalUrl, prismaCode: err.code, error: err.message })
    }
    return res.status(status).json({ success: false, message, requestId: req.id })
  }

  if (err.code) {
    for (const statusMap of DOMAIN_ERROR_HTTP_STATUS_MAPS) {
      if (statusMap[err.code]) {
        return res.status(statusMap[err.code]).json({ code: err.code, message: err.message, details: err.details, requestId: req.id })
      }
    }
  }
  if (err.statusCode) {
    // U9: a plain statusCode error (match.service.js's own convention — see
    // its file header) can still carry structured `details` the same shape
    // domain errors already expose, e.g. startMatch's understaffed-warning
    // slot counts. Omitted entirely when absent, matching the previous
    // response shape exactly for every existing caller.
    return res.status(err.statusCode).json({ message: err.message, ...(err.details ? { details: err.details } : {}), requestId: req.id })
  }

  // Unexpected error (programming bug, raw DB/driver error, etc.) — never
  // leak internal details (message, stack, driver hints) to the client.
  // Full detail goes to the server log only. requestId IS safe to return
  // here — it's an opaque correlation token, not internal detail — and is
  // exactly what support needs to look up this specific failure in the logs.
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  })
  res.status(500).json({ message: 'Internal Server Error', requestId: req.id })
}
