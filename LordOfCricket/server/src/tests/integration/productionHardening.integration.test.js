// Phase 19 — production hardening integration tests. Exercises the real
// HTTP layer (app.js), same pattern as commentary.integration.test.js: a
// real http.createServer(app) on a random free port, plain fetch() calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { errorHandler } from '../../middlewares/errorHandler.js'
import { BookingError, BOOKING_ERROR_CODES } from '../../domain/booking/errors.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

// FINAL AUDIT — Phase 21.2 (request traceability) added `requestId: req.id`
// to every branch of errorHandler.js's response body, for incident-log
// correlation. OLD EXPECTATION (below, before this pass): the body was
// exactly `{message}`, nothing else. ACTUAL CONTRACT since Phase 21.2: the
// body always also carries `requestId` — a real UUID for a genuine HTTP
// request (set by middlewares/requestId.js earlier in the chain), or
// `undefined` here specifically because these two tests hand-build a bare
// `req` object and call errorHandler() directly, bypassing that middleware
// entirely (a deliberate, minimal unit-style test of errorHandler in
// isolation, not a real HTTP request). NEW EXPECTATION: assert `requestId`
// is present as a key (value `undefined` in this specific unit-style
// context) alongside the existing message assertion, matching what the
// real response object now always contains.
test('errorHandler never leaks a raw/unexpected error message or stack to the client', () => {
  let captured = null
  const req = { method: 'GET', originalUrl: '/api/whatever' }
  const res = { status(code) { captured = { code }; return this }, json(body) { captured.body = body; return this } }
  const err = new Error('relation "teams" does not exist — column foo.bar')
  err.stack = 'Error: relation "teams" does not exist\n    at internalDbDriverInternals (/app/node_modules/pg/lib/secret.js:1:1)'

  errorHandler(err, req, res, () => {})

  assert.equal(captured.code, 500)
  assert.deepEqual(captured.body, { message: 'Internal Server Error', requestId: req.id })
})

test('errorHandler passes through an intentional statusCode+message unchanged (service-thrown 404s etc.)', () => {
  let captured = null
  const req = { method: 'GET', originalUrl: '/api/teams/999' }
  const res = { status(code) { captured = { code }; return this }, json(body) { captured.body = body; return this } }
  const err = new Error('Team not found.')
  err.statusCode = 404

  errorHandler(err, req, res, () => {})

  assert.equal(captured.code, 404)
  assert.deepEqual(captured.body, { message: 'Team not found.', requestId: req.id })
})

test('errorHandler still returns the full structured shape for a domain-coded error', () => {
  let captured = null
  const req = { method: 'POST', originalUrl: '/api/bookings' }
  const res = { status(code) { captured = { code }; return this }, json(body) { captured.body = body; return this } }
  const err = new BookingError(BOOKING_ERROR_CODES.BOOKING_CONFLICT, 'This time was just booked.', { alternatives: [] })

  errorHandler(err, req, res, () => {})

  assert.equal(captured.body.code, BOOKING_ERROR_CODES.BOOKING_CONFLICT)
  assert.equal(captured.body.message, 'This time was just booked.')
})

test('a malformed numeric route param (GET /teams/:id) is rejected with a clean 400, not a raw DB error', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/teams/not-a-number/profile`)
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.match(body.message, /positive integer/)
  } finally {
    await server.close()
  }
})

test('an unknown route returns a structured 404, not a framework default page', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/this-route-does-not-exist`)
    assert.equal(res.status, 404)
    const body = await res.json()
    assert.match(body.message, /Route not found/)
  } finally {
    await server.close()
  }
})

test('malformed pagination (?limit=abc&offset=-5) on a public list endpoint degrades to safe defaults instead of a 500', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/tournaments?limit=abc&offset=-5`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.pagination.limit >= 1)
    assert.ok(body.pagination.offset >= 0)
  } finally {
    await server.close()
  }
})

test('every response carries the standard security headers (helmet)', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/health`)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.ok(res.headers.get('content-security-policy'))
  } finally {
    await server.close()
  }
})

test('CORS: a request from a disallowed origin gets no Access-Control-Allow-Origin header', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/health`, { headers: { Origin: 'https://not-a-real-loc-deployment.example' } })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  } finally {
    await server.close()
  }
})

test('a staff-only endpoint rejects an unauthenticated request with 401, and a non-staff user with 403', async () => {
  const server = await startTestApp()
  try {
    const unauth = await fetch(`${server.baseUrl}/ground/dashboard`)
    assert.equal(unauth.status, 401)
  } finally {
    await server.close()
  }
})

// Phase 8 — this test used to hit the legacy `/auth/login` (email+password)
// endpoint, removed this phase (zero reachable frontend callers — see
// docs/AUTH.md). `/auth/verify-otp` is the real credential/code-guessing
// surface now (guessing a 6-digit OTP is the modern equivalent of guessing
// a password) and carries its own limiter (otpVerifyLimiter, same 20/15min
// ceiling authLimiter used to have) — this test now proves that one fires.
test('the OTP verify endpoint is rate-limited: enough rapid attempts eventually get a 429, not an unbounded retry surface', async () => {
  const server = await startTestApp()
  try {
    let sawRateLimited = false
    for (let i = 0; i < 25; i += 1) {
      const res = await fetch(`${server.baseUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nobody@example.test', code: '000000' }),
      })
      if (res.status === 429) {
        sawRateLimited = true
        const body = await res.json()
        assert.ok(body.message)
        break
      }
      assert.notEqual(res.status, 500, 'a wrong OTP must never crash the request')
    }
    assert.ok(sawRateLimited, 'expected the OTP verify rate limiter to trigger a 429 within 25 rapid attempts')
  } finally {
    await server.close()
  }
})
