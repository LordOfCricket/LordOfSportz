// Landmark search (Grounds page — "give a landmark, sort grounds around
// it"), real HTTP against this app's own server, real network to
// OpenStreetMap Nominatim. Preflight-guarded the same way Cloudinary
// upload tests are (canteenMenu.integration.test.js) — if this sandbox
// can't reach the public internet, the one test needing a real successful
// geocode skips with a clear reason instead of failing; the input-
// validation tests (which never touch Nominatim) always run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'

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

let nominatimReachable = false
let preflightSkipReason = 'Nominatim preflight lookup did not run'
try {
  const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=India+Gate', {
    headers: { 'User-Agent': 'LordOfCricket-LOC/1.0 (test preflight)' },
  })
  if (res.ok) {
    nominatimReachable = true
  } else {
    preflightSkipReason = `Nominatim returned ${res.status} — not a regression, this sandbox's network may not permit it`
  }
} catch (err) {
  preflightSkipReason = `Nominatim is not reachable from this environment (${err.message}) — not a regression`
}

test('GET /geocode: missing q -> 400, never a 500', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/geocode`)
    assert.equal(res.status, 400)
  } finally {
    await server.close()
  }
})

test('GET /geocode: blank q -> 400', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('   ')}`)
    assert.equal(res.status, 400)
  } finally {
    await server.close()
  }
})

test('GET /geocode: an overly long q -> 400', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('x'.repeat(151))}`)
    assert.equal(res.status, 400)
  } finally {
    await server.close()
  }
})

test(
  'GET /geocode: a real, well-known landmark resolves to real coordinates in a sane range',
  { skip: !nominatimReachable && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    try {
      const res = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('India Gate, Delhi')}`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(Number.isFinite(body.latitude) && body.latitude > 28 && body.latitude < 29, 'India Gate is around 28.6°N')
      assert.ok(Number.isFinite(body.longitude) && body.longitude > 77 && body.longitude < 78, 'India Gate is around 77.2°E')
      assert.ok(typeof body.displayName === 'string' && body.displayName.length > 0)
    } finally {
      await server.close()
    }
  },
)

test(
  'GET /geocode: a nonsense query that matches nowhere -> 404, not a 500',
  { skip: !nominatimReachable && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    try {
      const res = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('zzzznonexistentplacezzzz12345xyz')}`)
      assert.equal(res.status, 404)
    } finally {
      await server.close()
    }
  },
)

test(
  'GET /geocode: repeated identical queries are cache-served (second call is fast, no duplicate Nominatim hit)',
  { skip: !nominatimReachable && preflightSkipReason },
  async () => {
    const server = await startTestApp()
    try {
      const first = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('India Gate, Delhi')}`)
      assert.equal(first.status, 200)

      const start = Date.now()
      const second = await fetch(`${server.baseUrl}/geocode?q=${encodeURIComponent('India Gate, Delhi')}`)
      const elapsedMs = Date.now() - start
      assert.equal(second.status, 200)
      assert.ok(elapsedMs < 500, `cached lookup should be near-instant, took ${elapsedMs}ms`)

      const firstBody = await first.json()
      const secondBody = await second.json()
      assert.deepEqual(firstBody, secondBody)
    } finally {
      await server.close()
    }
  },
)
