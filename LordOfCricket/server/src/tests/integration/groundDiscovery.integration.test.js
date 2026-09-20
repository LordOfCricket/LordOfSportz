// Phase 12 — public ground discovery (GET /grounds/nearby) and public
// ground profile (GET /grounds/:publicGroundId). Real HTTP pattern matching
// every other integration test in this codebase: http.createServer(app) on
// a random port, plain fetch(), no mocking of the database. Disposable
// ground fixtures only — the real SS Cricket Ground business data is never
// modified, only read (sanity checks at the bottom).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { generatePublicId } from '../../utils/publicId.js'

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

// Independent JS haversine implementation (Step 31) — deliberately NOT
// shared code with ground.model.js's SQL version, so a bug in one is
// unlikely to be mirrored in the other.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createGroundFixture({ label, lat, lng, status = 'ACTIVE', city = 'Test City', state = 'Test State' }) {
  const tag = uniqueTag()
  const ground = (
    await pool.query(
      `INSERT INTO grounds (public_ground_id, slug, name, city, state, country, latitude, longitude, status)
       VALUES ($1,$2,$3,$4,$5,'India',$6,$7,$8) RETURNING *`,
      [generatePublicId('GRD', 8), `integration-test-gd-${label}-${tag}`, `Integration Test Ground ${label} ${tag}`, city, state, lat, lng, status],
    )
  ).rows[0]
  return {
    ground,
    async addPhoto(title) {
      const { rows } = await pool.query(
        `INSERT INTO ground_photos (ground_id, title, image_url, sort_order) VALUES ($1,$2,$3,0) RETURNING *`,
        [ground.id, title, `https://example.test/${title}.jpg`],
      )
      return rows[0]
    },
    async addAmenity(name) {
      const { rows } = await pool.query(
        `INSERT INTO amenities (ground_id, name, image_url, sort_order) VALUES ($1,$2,$3,0) RETURNING *`,
        [ground.id, name, `https://example.test/${name}.jpg`],
      )
      return rows[0]
    },
    async addCanteen(name) {
      const { rows } = await pool.query(
        `INSERT INTO canteens (ground_id, public_canteen_id, name) VALUES ($1,$2,$3) RETURNING *`,
        [ground.id, generatePublicId('CAN', 8), name],
      )
      return rows[0]
    },
    async cleanup() {
      // ground_photos/amenities/canteens -> grounds are NOT ON DELETE CASCADE
      // (schema.sql, same convention as menu_items/today_menu/orders ->
      // canteens) — must delete children explicitly first.
      const canteens = (await pool.query('SELECT id FROM canteens WHERE ground_id = $1', [ground.id])).rows
      for (const c of canteens) {
        await pool.query('DELETE FROM orders WHERE canteen_id = $1', [c.id])
        await pool.query('DELETE FROM today_menu WHERE canteen_id = $1', [c.id])
        await pool.query('DELETE FROM menu_items WHERE canteen_id = $1', [c.id])
      }
      await pool.query('DELETE FROM canteens WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM amenities WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

// Reference point: Connaught Place, Delhi.
const ORIGIN = { lat: 28.6139, lng: 77.209 }
// ~2.1km away (India Gate) — well inside any test radius.
const NEAR = { lat: 28.6129, lng: 77.2295 }
// ~19km away — inside a 25km radius, outside a 5km radius.
const MEDIUM = { lat: 28.5562, lng: 77.1 }
// ~1150km away (Mumbai) — outside any radius used in these tests.
const FAR = { lat: 19.076, lng: 72.8777 }

// ---------------------------------------------------------------------------
// Discovery test matrix (Step 30)
// ---------------------------------------------------------------------------

test('DISCOVERY A/B: active ground inside radius is returned, active ground outside radius is not', async () => {
  const server = await startTestApp()
  const near = await createGroundFixture({ label: 'near', ...NEAR })
  const far = await createGroundFixture({ label: 'far', ...FAR })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    assert.ok(ids.includes(near.ground.public_ground_id), 'ground inside the radius must be returned')
    assert.ok(!ids.includes(far.ground.public_ground_id), 'ground outside the radius must not be returned')
  } finally {
    await near.cleanup()
    await far.cleanup()
    await server.close()
  }
})

test('DISCOVERY C/D: DRAFT and SUSPENDED grounds are never returned, even when inside the radius', async () => {
  const server = await startTestApp()
  const draft = await createGroundFixture({ label: 'draft', ...NEAR, status: 'DRAFT' })
  const suspended = await createGroundFixture({ label: 'suspended', ...NEAR, status: 'SUSPENDED' })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    assert.ok(!ids.includes(draft.ground.public_ground_id), 'DRAFT ground must never appear in public discovery')
    assert.ok(!ids.includes(suspended.ground.public_ground_id), 'SUSPENDED ground must never appear in public discovery')
  } finally {
    await draft.cleanup()
    await suspended.cleanup()
    await server.close()
  }
})

test('DISCOVERY E/F: results are sorted nearest-first across multiple grounds', async () => {
  const server = await startTestApp()
  const near = await createGroundFixture({ label: 'sort-near', ...NEAR })
  const medium = await createGroundFixture({ label: 'sort-medium', ...MEDIUM })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`)
    const body = await res.json()
    const ours = body.grounds.filter((g) => [near.ground.public_ground_id, medium.ground.public_ground_id].includes(g.publicGroundId))
    assert.equal(ours.length, 2, 'both fixtures must be present')
    assert.equal(ours[0].publicGroundId, near.ground.public_ground_id, 'the nearer ground must appear first')
    assert.equal(ours[1].publicGroundId, medium.ground.public_ground_id, 'the farther ground must appear second')
    assert.ok(ours[0].distanceKm < ours[1].distanceKm, 'distanceKm must increase monotonically')
  } finally {
    await near.cleanup()
    await medium.cleanup()
    await server.close()
  }
})

test('DISTANCE CORRECTNESS: returned distanceKm matches an independently computed haversine value', async () => {
  const server = await startTestApp()
  const near = await createGroundFixture({ label: 'distance-check', ...NEAR })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`)
    const body = await res.json()
    const match = body.grounds.find((g) => g.publicGroundId === near.ground.public_ground_id)
    assert.ok(match, 'fixture ground must be present')
    const expected = haversineKm(ORIGIN.lat, ORIGIN.lng, NEAR.lat, NEAR.lng)
    assert.ok(Math.abs(match.distanceKm - expected) < 0.1, `expected ~${expected.toFixed(2)}km, got ${match.distanceKm}km`)
    assert.ok(match.distanceKm > 0 && match.distanceKm < 5, 'sanity bound: India Gate is a few km from Connaught Place, not near-zero or huge')
  } finally {
    await near.cleanup()
    await server.close()
  }
})

test('DISCOVERY G/H: pagination works and the maximum limit is enforced', async () => {
  const server = await startTestApp()
  const fixtures = []
  for (let i = 0; i < 3; i++) {
    fixtures.push(await createGroundFixture({ label: `page-${i}`, lat: NEAR.lat + i * 0.001, lng: NEAR.lng + i * 0.001 }))
  }
  try {
    const page1 = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25&limit=2&page=1`)
    const body1 = await page1.json()
    assert.equal(body1.grounds.length, 2, 'page 1 with limit=2 must return exactly 2 grounds')
    assert.equal(body1.pagination.page, 1)
    assert.equal(body1.pagination.limit, 2)
    assert.ok(body1.pagination.total >= 3)

    const page2 = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25&limit=2&page=2`)
    const body2 = await page2.json()
    assert.ok(body2.grounds.length >= 1, 'page 2 must return the remainder')
    const page1Ids = new Set(body1.grounds.map((g) => g.publicGroundId))
    for (const g of body2.grounds) {
      assert.ok(!page1Ids.has(g.publicGroundId), 'page 2 must not repeat page 1 results')
    }

    const overLimit = await fetch(`${server.baseUrl}/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25&limit=999999`)
    const overBody = await overLimit.json()
    assert.ok(overLimit.status === 200, 'an oversized limit must not error')
    assert.ok(overBody.pagination.limit <= 50, 'the maximum limit must be clamped, never honored as-is')
  } finally {
    for (const fx of fixtures) await fx.cleanup()
    await server.close()
  }
})

test('DISCOVERY I/J/K: invalid lat/lng/radius are rejected with 400', async () => {
  const server = await startTestApp()
  try {
    const badLat = await fetch(`${server.baseUrl}/grounds/nearby?lat=200&lng=77.2&radiusKm=10`)
    assert.equal(badLat.status, 400)

    const missingLat = await fetch(`${server.baseUrl}/grounds/nearby?lng=77.2&radiusKm=10`)
    assert.equal(missingLat.status, 400)

    const nanLat = await fetch(`${server.baseUrl}/grounds/nearby?lat=notanumber&lng=77.2&radiusKm=10`)
    assert.equal(nanLat.status, 400)

    const badLng = await fetch(`${server.baseUrl}/grounds/nearby?lat=28.6&lng=999&radiusKm=10`)
    assert.equal(badLng.status, 400)

    const zeroRadius = await fetch(`${server.baseUrl}/grounds/nearby?lat=28.6&lng=77.2&radiusKm=0`)
    assert.equal(zeroRadius.status, 400)

    const negativeRadius = await fetch(`${server.baseUrl}/grounds/nearby?lat=28.6&lng=77.2&radiusKm=-5`)
    assert.equal(negativeRadius.status, 400)

    const hugeRadius = await fetch(`${server.baseUrl}/grounds/nearby?lat=28.6&lng=77.2&radiusKm=999999999`)
    assert.equal(hugeRadius.status, 200, 'an oversized radius must be clamped, not rejected outright')
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Public profile tests (Step 30 L-P, Step 32 security)
// ---------------------------------------------------------------------------

test('PROFILE L: unknown publicGroundId returns 404', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/grounds/GRD-doesnotexist`)
    assert.equal(res.status, 404)
  } finally {
    await server.close()
  }
})

test('PROFILE: DRAFT/SUSPENDED grounds 404 on the public profile too (Step 24) — never confirm they exist', async () => {
  const server = await startTestApp()
  const draft = await createGroundFixture({ label: 'profile-draft', ...NEAR, status: 'DRAFT' })
  const suspended = await createGroundFixture({ label: 'profile-suspended', ...NEAR, status: 'SUSPENDED' })
  try {
    const draftRes = await fetch(`${server.baseUrl}/grounds/${draft.ground.public_ground_id}`)
    assert.equal(draftRes.status, 404)
    const suspendedRes = await fetch(`${server.baseUrl}/grounds/${suspended.ground.public_ground_id}`)
    assert.equal(suspendedRes.status, 404)
  } finally {
    await draft.cleanup()
    await suspended.cleanup()
    await server.close()
  }
})

test('PROFILE M/N/O/P: profile returns only the requested ground\'s own photos/amenities/canteen, never another ground\'s', async () => {
  const server = await startTestApp()
  const a = await createGroundFixture({ label: 'profile-a', ...NEAR })
  const b = await createGroundFixture({ label: 'profile-b', ...MEDIUM })
  await a.addPhoto('ground-a-photo')
  await a.addAmenity('ground-a-amenity')
  await a.addCanteen('Ground A Canteen')
  await b.addPhoto('ground-b-photo')
  await b.addAmenity('ground-b-amenity')
  await b.addCanteen('Ground B Canteen')
  try {
    const res = await fetch(`${server.baseUrl}/grounds/${a.ground.public_ground_id}`)
    assert.equal(res.status, 200)
    const body = await res.json()

    assert.equal(body.ground.publicGroundId, a.ground.public_ground_id, 'M: profile must be for the requested ground')
    assert.equal(body.ground.name, a.ground.name)

    assert.equal(body.photos.length, 1, 'N: exactly Ground A\'s own photo count')
    assert.equal(body.photos[0].title, 'ground-a-photo')
    assert.ok(!body.photos.some((p) => p.title === 'ground-b-photo'), 'N: Ground B\'s photo must never appear')

    assert.equal(body.amenities.length, 1, 'O: exactly Ground A\'s own amenity count')
    assert.equal(body.amenities[0].name, 'ground-a-amenity')
    assert.ok(!body.amenities.some((am) => am.name === 'ground-b-amenity'), 'O: Ground B\'s amenity must never appear')

    assert.equal(body.canteens.length, 1, 'P: exactly Ground A\'s own canteen count')
    assert.equal(body.canteens[0].name, 'Ground A Canteen')
    assert.ok(!body.canteens.some((c) => c.name === 'Ground B Canteen'), 'P: Ground B\'s canteen must never appear')
  } finally {
    await a.cleanup()
    await b.cleanup()
    await server.close()
  }
})

test('PROFILE SECURITY (Step 32): client-supplied ground_id in query/body is ignored — the URL param is the only tenancy signal', async () => {
  const server = await startTestApp()
  const a = await createGroundFixture({ label: 'security-a', ...NEAR })
  const b = await createGroundFixture({ label: 'security-b', ...MEDIUM })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/${a.ground.public_ground_id}?ground_id=${b.ground.id}&groundId=${b.ground.id}`, {
      method: 'GET',
    })
    const body = await res.json()
    assert.equal(body.ground.publicGroundId, a.ground.public_ground_id, 'query-string ground_id/groundId must never override the URL-resolved ground')
  } finally {
    await a.cleanup()
    await b.cleanup()
    await server.close()
  }
})

test('PROFILE: response never leaks internal numeric ids, ground_users, or staff information', async () => {
  const server = await startTestApp()
  const a = await createGroundFixture({ label: 'privacy', ...NEAR })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/${a.ground.public_ground_id}`)
    const text = await res.text()
    assert.ok(!text.includes('"id":' + a.ground.id), 'internal numeric ground id must not appear in the response')
    assert.ok(!/ground_users|staff_role|password_hash|cloudinary_public_id|created_by/.test(text), 'no internal/authorization/audit field names must leak')
  } finally {
    await a.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// City-based discovery (Phase 13 post-report revision — GET /grounds/search)
// ---------------------------------------------------------------------------

test('CITY SEARCH: an active ground in the searched city is returned, a ground in a different city is not', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const match = await createGroundFixture({ label: 'city-match', ...NEAR, city: `Springfield-${tag}` })
  const other = await createGroundFixture({ label: 'city-other', ...NEAR, city: `Shelbyville-${tag}` })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`Springfield-${tag}`)}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    assert.ok(ids.includes(match.ground.public_ground_id), 'a ground in the searched city must be returned')
    assert.ok(!ids.includes(other.ground.public_ground_id), 'a ground in a different city must not be returned')
    assert.equal(body.grounds.find((g) => g.publicGroundId === match.ground.public_ground_id).distanceKm, undefined, 'city search results carry no distanceKm — no coordinates are involved')
  } finally {
    await match.cleanup()
    await other.cleanup()
    await server.close()
  }
})

test('CITY SEARCH: matching is case-insensitive and partial (substring)', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const fx = await createGroundFixture({ label: 'city-partial', ...NEAR, city: `New Delhi-${tag}` })
  try {
    const lower = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`new delhi-${tag}`)}`)
    const lowerBody = await lower.json()
    assert.ok(lowerBody.grounds.some((g) => g.publicGroundId === fx.ground.public_ground_id), 'search must be case-insensitive')

    const partial = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`Delhi-${tag}`)}`)
    const partialBody = await partial.json()
    assert.ok(partialBody.grounds.some((g) => g.publicGroundId === fx.ground.public_ground_id), 'a substring of the city name must match')
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('CITY SEARCH: DRAFT/SUSPENDED grounds never appear, even in a matching city', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const draft = await createGroundFixture({ label: 'city-draft', ...NEAR, city: `Riverdale-${tag}`, status: 'DRAFT' })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`Riverdale-${tag}`)}`)
    const body = await res.json()
    assert.ok(!body.grounds.some((g) => g.publicGroundId === draft.ground.public_ground_id), 'a DRAFT ground must never appear in city search')
  } finally {
    await draft.cleanup()
    await server.close()
  }
})

test('CITY SEARCH: missing/blank city is rejected with 400; an unmatched city returns an empty, valid result', async () => {
  const server = await startTestApp()
  try {
    const missing = await fetch(`${server.baseUrl}/grounds/search`)
    assert.equal(missing.status, 400)

    const blank = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent('   ')}`)
    assert.equal(blank.status, 400)

    const tooLong = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent('x'.repeat(101))}`)
    assert.equal(tooLong.status, 400)

    const noMatch = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`Nowhereville-${uniqueTag()}`)}`)
    assert.equal(noMatch.status, 200)
    const body = await noMatch.json()
    assert.deepEqual(body.grounds, [])
    assert.equal(body.pagination.total, 0)
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Browse-all listing (GET /grounds — "grounds already registered on LOC")
// ---------------------------------------------------------------------------

test('LIST ALL: an active ground is returned regardless of city; DRAFT/SUSPENDED are excluded', async () => {
  const server = await startTestApp()
  const active = await createGroundFixture({ label: 'list-active', ...FAR, city: `Faraway-${uniqueTag()}` })
  const draft = await createGroundFixture({ label: 'list-draft', ...NEAR, status: 'DRAFT' })
  const suspended = await createGroundFixture({ label: 'list-suspended', ...NEAR, status: 'SUSPENDED' })
  try {
    const res = await fetch(`${server.baseUrl}/grounds`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    assert.ok(ids.includes(active.ground.public_ground_id), 'an ACTIVE ground must be listed regardless of distance/city')
    assert.ok(!ids.includes(draft.ground.public_ground_id), 'DRAFT must never be listed')
    assert.ok(!ids.includes(suspended.ground.public_ground_id), 'SUSPENDED must never be listed')
    assert.equal(body.grounds.find((g) => g.publicGroundId === active.ground.public_ground_id).distanceKm, undefined, 'the browse-all list carries no distanceKm')
  } finally {
    await active.cleanup()
    await draft.cleanup()
    await suspended.cleanup()
    await server.close()
  }
})

test('LIST ALL: pagination is enforced (maximum limit clamped, page/limit honored)', async () => {
  const server = await startTestApp()
  const oversizedLimit = await fetch(`${server.baseUrl}/grounds?limit=999999`)
  const body = await oversizedLimit.json()
  assert.equal(oversizedLimit.status, 200)
  assert.ok(body.pagination.limit <= 50, 'the maximum limit must be clamped, never honored as-is')
  await server.close()
})

test('LIST ALL: sort=newest orders by created_at DESC; an unrecognized sort value falls back to name ASC, never a 500', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const older = await createGroundFixture({ label: 'sort-older', ...FAR, city: `SortCity-${tag}` })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const newer = await createGroundFixture({ label: 'sort-newer', ...FAR, city: `SortCity-${tag}` })
  try {
    const res = await fetch(`${server.baseUrl}/grounds?sort=newest&limit=50`)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    const olderIndex = ids.indexOf(older.ground.public_ground_id)
    const newerIndex = ids.indexOf(newer.ground.public_ground_id)
    assert.ok(olderIndex !== -1 && newerIndex !== -1, 'both fixtures must be present')
    assert.ok(newerIndex < olderIndex, 'sort=newest must put the more recently created ground first')

    const bogus = await fetch(`${server.baseUrl}/grounds?sort=drop-table-grounds`)
    assert.equal(bogus.status, 200, 'an unrecognized sort value must never 500 or be passed through to SQL')
  } finally {
    await older.cleanup()
    await newer.cleanup()
    await server.close()
  }
})

test('LIST ALL: sort=city groups by city alphabetically, then name within a city (Grounds page\'s "first sort by city")', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  // Cities deliberately out of alphabetical creation order, to prove the
  // sort is real (not just insertion order coinciding with city order).
  const zCity = await createGroundFixture({ label: 'aaa-name', ...NEAR, city: `ZZZCity-${tag}` })
  const aCityB = await createGroundFixture({ label: 'zzz-name', ...NEAR, city: `AAACity-${tag}` })
  const aCityA = await createGroundFixture({ label: 'aaa-name-2', ...NEAR, city: `AAACity-${tag}` })
  try {
    const res = await fetch(`${server.baseUrl}/grounds?sort=city&limit=50`)
    const body = await res.json()
    const ids = body.grounds.map((g) => g.publicGroundId)
    const aCityAIndex = ids.indexOf(aCityA.ground.public_ground_id)
    const aCityBIndex = ids.indexOf(aCityB.ground.public_ground_id)
    const zCityIndex = ids.indexOf(zCity.ground.public_ground_id)
    assert.ok(aCityAIndex !== -1 && aCityBIndex !== -1 && zCityIndex !== -1, 'all three fixtures must be present')
    assert.ok(aCityAIndex < zCityIndex && aCityBIndex < zCityIndex, 'AAACity grounds must sort before ZZZCity grounds')
    assert.ok(aCityAIndex < aCityBIndex, 'within the same city, name ASC is the tie-break')
  } finally {
    await zCity.cleanup()
    await aCityB.cleanup()
    await aCityA.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Real amenities in list responses (homepage redesign, Stage 1)
// ---------------------------------------------------------------------------

test('nearby/search/all-list responses include each ground\'s own real amenity names, never another ground\'s, and [] when it has none', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const withAmenities = await createGroundFixture({ label: 'amenities-a', ...NEAR, city: `AmenityCity-${tag}` })
  const withoutAmenities = await createGroundFixture({ label: 'amenities-b', ...NEAR, city: `AmenityCity-${tag}` })
  await withAmenities.addAmenity(`Floodlights-${tag}`)
  await withAmenities.addAmenity(`Parking-${tag}`)
  try {
    const searchRes = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(`AmenityCity-${tag}`)}`)
    const searchBody = await searchRes.json()
    const a = searchBody.grounds.find((g) => g.publicGroundId === withAmenities.ground.public_ground_id)
    const b = searchBody.grounds.find((g) => g.publicGroundId === withoutAmenities.ground.public_ground_id)
    assert.deepEqual(new Set(a.amenities), new Set([`Floodlights-${tag}`, `Parking-${tag}`]))
    assert.deepEqual(b.amenities, [], 'a ground with zero amenities must get an empty array, never null/undefined')

    const allRes = await fetch(`${server.baseUrl}/grounds?limit=50`)
    const allBody = await allRes.json()
    const aFromAll = allBody.grounds.find((g) => g.publicGroundId === withAmenities.ground.public_ground_id)
    assert.deepEqual(new Set(aFromAll.amenities), new Set([`Floodlights-${tag}`, `Parking-${tag}`]), 'the browse-all list must carry the same real amenities')
  } finally {
    await withAmenities.cleanup()
    await withoutAmenities.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Real distinct cities (GET /grounds/cities — homepage redesign, Stage 1)
// ---------------------------------------------------------------------------

test('GET /grounds/cities returns real distinct ACTIVE-ground cities only, excludes DRAFT/SUSPENDED, no duplicates', async () => {
  const server = await startTestApp()
  const tag = uniqueTag()
  const cityA = `CitiesTestA-${tag}`
  const active1 = await createGroundFixture({ label: 'cities-active-1', ...NEAR, city: cityA })
  const active2 = await createGroundFixture({ label: 'cities-active-2', ...NEAR, city: cityA })
  const draft = await createGroundFixture({ label: 'cities-draft', ...NEAR, city: `CitiesTestDraft-${tag}`, status: 'DRAFT' })
  try {
    const res = await fetch(`${server.baseUrl}/grounds/cities`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.cities))
    const occurrences = body.cities.filter((c) => c === cityA)
    assert.equal(occurrences.length, 1, 'a city with 2 active grounds must appear exactly once, not duplicated')
    assert.ok(!body.cities.includes(`CitiesTestDraft-${tag}`), 'a city whose only ground is DRAFT must not appear')
  } finally {
    await active1.cleanup()
    await active2.cleanup()
    await draft.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Real-data sanity (read-only — never mutates the real SS Cricket Ground)
// ---------------------------------------------------------------------------

test('REAL DATA SANITY: the real SS Cricket Ground is discoverable and its profile loads without touching its data', async () => {
  const server = await startTestApp()
  try {
    const real = (await pool.query(`SELECT * FROM grounds WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`)).rows[0]
    assert.ok(real, 'the real seeded ground must exist for this sanity check to mean anything')

    const profileRes = await fetch(`${server.baseUrl}/grounds/${real.public_ground_id}`)
    assert.equal(profileRes.status, 200)
    const body = await profileRes.json()
    assert.equal(body.ground.publicGroundId, real.public_ground_id)
    assert.equal(body.ground.name, real.name)
    assert.ok(Array.isArray(body.photos))
    assert.ok(Array.isArray(body.amenities))
    assert.ok(Array.isArray(body.canteens))
  } finally {
    await server.close()
  }
})

test('REAL DATA SANITY: the real SS Cricket Ground is discoverable by its real city via city search', async () => {
  const server = await startTestApp()
  try {
    const real = (await pool.query(`SELECT * FROM grounds WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`)).rows[0]
    assert.ok(real?.city, 'the real seeded ground must have a city for this sanity check to mean anything')

    const res = await fetch(`${server.baseUrl}/grounds/search?city=${encodeURIComponent(real.city)}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.grounds.some((g) => g.publicGroundId === real.public_ground_id), 'the real ground must be findable by its own real city')
  } finally {
    await server.close()
  }
})

test('REAL DATA SANITY: the real SS Cricket Ground appears in the browse-all listing', async () => {
  const server = await startTestApp()
  try {
    const real = (await pool.query(`SELECT * FROM grounds WHERE status = 'ACTIVE' ORDER BY id LIMIT 1`)).rows[0]
    const res = await fetch(`${server.baseUrl}/grounds`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(body.grounds.some((g) => g.publicGroundId === real.public_ground_id), 'the real ground must appear in the unfiltered browse-all list')
  } finally {
    await server.close()
  }
})
