// Minimal structured logger — no external dependency (Phase 19: "do not
// introduce unnecessary frameworks"). Every line is a single JSON object on
// stdout/stderr, so it is trivially greppable/ingestible by any log
// collector without pulling in pino/winston for a project this size.
//
// Never pass secrets (passwords, tokens, API keys, private keys) into
// `meta` — callers are responsible for that, same as they already are for
// existing console.log/console.error call sites this replaces.

import { AsyncLocalStorage } from 'async_hooks'

// Phase 21.2 — request-id propagation. middlewares/requestId.js enters this
// context once per request (wrapping `next()`); every log call made
// anywhere during that request's lifetime — including deep in a
// service/model several async hops away — automatically picks up the same
// id with zero changes to any of the ~40+ existing logger.* call sites.
// Outside a request (startup, background scripts) getStore() is undefined
// and the field is simply omitted, exactly as before this change.
const requestContext = new AsyncLocalStorage()

export function runWithRequestId(id, fn) {
  return requestContext.run({ requestId: id }, fn)
}

function write(stream, level, message, meta) {
  const requestId = requestContext.getStore()?.requestId
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  }
  stream.write(JSON.stringify(line) + '\n')
}

export const logger = {
  info: (message, meta) => write(process.stdout, 'info', message, meta),
  warn: (message, meta) => write(process.stdout, 'warn', message, meta),
  error: (message, meta) => write(process.stderr, 'error', message, meta),
}
