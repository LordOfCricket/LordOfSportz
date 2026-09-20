import { randomUUID } from 'crypto'
import { runWithRequestId } from '../utils/logger.js'

// Phase 21.2 — every request gets a correlation id so a single incident can
// be traced across every log line and, if a client already generates its
// own trace id (a mobile client, a future upstream proxy), that id is
// honored instead of a new one being minted — but only when it looks like a
// real id, never propagated verbatim into logs/headers unsanitized.
const VALID_ID = /^[\w-]{1,128}$/

export function requestId(req, res, next) {
  const inbound = req.headers['x-request-id']
  const id = typeof inbound === 'string' && VALID_ID.test(inbound) ? inbound : randomUUID()
  req.id = id
  res.set('X-Request-Id', id)
  runWithRequestId(id, next)
}
