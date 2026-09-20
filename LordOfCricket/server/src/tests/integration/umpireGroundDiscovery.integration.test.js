// Umpire Ground-Wise Match Availability — GET /umpire/grounds/nearby and
// GET /umpire/grounds/by-city. Real HTTP pattern matching every other
// integration test in this codebase: http.createServer(app) on a random
// port, plain fetch(), no mocking of the database. Ground fixtures mirror
// groundDiscovery.integration.test.js's createGroundFixture; umpire/team/
// match fixtures mirror umpireSelfService.integration.test.js's helpers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import * as matchService from '../../services/match.service.js'

function stubIo() {
  const chain = { emit: () => {} }
  return { emit: () => {}, to: () => chain }
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = stubIo()
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-ugd-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  for (const status of requestStatuses) {
    const decidedAt = status === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, status, decidedAt])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'UGA') RETURNING *`, [`UGD Test Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'UGB') RETURNING *`, [`UGD Test Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [
        [teamA.id, teamB.id],
      ])
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

async function createGroundFixture({ label, lat, lng, city = `UGD Test City ${uniqueTag()}` }) {
  const tag = uniqueTag()
  const ground = (
    await pool.query(
      `INSERT INTO grounds (public_ground_id, slug, name, city, state, country, latitude, longitude, status)
       VALUES ($1,$2,$3,$4,'Test State','India',$5,$6,'ACTIVE') RETURNING *`,
      [generatePublicId('GRD', 8), `integration-test-ugd-${label}-${tag}`, `Integration Test Ground ${label} ${tag}`, city, lat, lng],
    )
  ).rows[0]
  return {
    ground,
    async addPhoto(title) {
      await pool.query(`INSERT INTO ground_photos (ground_id, title, image_url, sort_order) VALUES ($1,$2,$3,0)`, [
        ground.id,
        title,
        `https://example.test/${title}.jpg`,
      ])
    },
    async addAmenity(name) {
      await pool.query(`INSERT INTO amenities (ground_id, name, image_url, sort_order) VALUES ($1,$2,$3,0)`, [
        ground.id,
        name,
        `https://example.test/${name}.jpg`,
      ])
    },
    async createMatch(teams, { requiredUmpires = 1, matchDate = new Date().toISOString(), status } = {}) {
      const match = await matchService.createMatch({
        teamAId: teams.teamA.id,
        teamBId: teams.teamB.id,
        venue: `Ground ${label}`,
        matchDate,
        groundId: ground.id,
        requiredUmpires,
      })
      if (status) await pool.query('UPDATE matches SET status = $2 WHERE id = $1', [match.id, status])
      return match
    },
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM amenities WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

// Connaught Place, Delhi.
const ORIGIN = { lat: 28.6139, lng: 77.209 }
// ~2.1km away (India Gate).
const NEAR = { lat: 28.6129, lng: 77.2295 }
// ~1150km away (Mumbai) — outside any radius used here.
const FAR = { lat: 19.076, lng: 72.8777 }

test('access control: denied for a pending umpire and a normal player, on both nearby and city routes', async () => {
  const server = await startTestApp()
  const pending = await makeUser({ label: 'gate-pending', playerType: 'umpire', requestStatuses: ['pending'] })
  const player = await makeUser({ label: 'gate-player', playerType: 'team_player' })
  try {
    const a = await json(`${server.baseUrl}/umpire/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`, { token: pending.token })
    const b = await json(`${server.baseUrl}/umpire/grounds/by-city?city=X`, { token: player.token })
    assert.equal(a.status, 403)
    assert.equal(b.status, 403)
  } finally {
    await pending.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('nearby: distanceKm present and sorted ascending; a ground with no upcoming matches is excluded even if inside the radius', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('nearby-basic')
  const withMatch = await createGroundFixture({ label: 'nearby-with-match', ...NEAR })
  const withoutMatch = await createGroundFixture({ label: 'nearby-without-match', ...NEAR })
  try {
    await withMatch.createMatch(teams, { requiredUmpires: 2 })

    const { status, data } = await json(`${server.baseUrl}/umpire/grounds/nearby?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}&radiusKm=25`, {
      token: umpire.token,
    })
    assert.equal(status, 200)
    const ids = data.grounds.map((g) => g.publicGroundId)
    assert.ok(ids.includes(withMatch.ground.public_ground_id), 'a ground with an upcoming match must appear')
    assert.ok(!ids.includes(withoutMatch.ground.public_ground_id), 'a ground with zero upcoming matches must not appear')

    const entry = data.grounds.find((g) => g.publicGroundId === withMatch.ground.public_ground_id)
    assert.equal(typeof entry.distanceKm, 'number', 'nearby results must carry a real distanceKm')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await withMatch.cleanup()
    await withoutMatch.cleanup()
    await server.close()
  }
})

test('by-city: no distanceKm in the response (manual-fallback path has no coordinates)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('city-basic')
  const tag = uniqueTag()
  const city = `UGD City Fallback ${tag}`
  const fixture = await createGroundFixture({ label: 'city-basic', ...NEAR, city })
  try {
    await fixture.createMatch(teams, { requiredUmpires: 2 })

    const { status, data } = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: umpire.token })
    assert.equal(status, 200)
    const entry = data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    assert.ok(entry, 'the ground must be found by city')
    assert.equal(entry.distanceKm, undefined, 'city search must never carry a fabricated distance')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

test('slot states: 0/2 and 1/2 are both still OPEN-eligible (real counts), 2/2 reads as fully staffed, required_umpires=0 has no slots, and the ground still renders even with a fully-staffed row', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('states-main')
  const otherUmpire = await approvedUmpire('states-filler')
  const tag = uniqueTag()
  const city = `UGD States City ${tag}`
  const fixture = await createGroundFixture({ label: 'states', ...NEAR, city })
  try {
    const zeroOfTwo = await fixture.createMatch(teams, { requiredUmpires: 2 })
    const oneOfTwo = await fixture.createMatch(teams, { requiredUmpires: 2 })
    await json(`${server.baseUrl}/matches/${oneOfTwo.id}/umpire-slots/apply`, { method: 'POST', token: otherUmpire.token })
    // otherUmpire applies to a SECOND match too — a day apart so the
    // umpire double-booking check (this same otherUmpire holds an ASSIGNED
    // slot on oneOfTwo already) doesn't treat these two same-instant
    // fixtures as a genuine schedule conflict.
    const twoOfTwo = await fixture.createMatch(teams, { requiredUmpires: 1, matchDate: new Date(Date.now() + 86400000).toISOString() })
    await json(`${server.baseUrl}/matches/${twoOfTwo.id}/umpire-slots/apply`, { method: 'POST', token: otherUmpire.token })
    const noneRequired = await fixture.createMatch(teams, { requiredUmpires: 0 })

    const { data } = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: umpire.token })
    const ground = data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    assert.ok(ground, 'the ground must still be present even though one of its matches is fully staffed')

    const byId = Object.fromEntries(ground.matches.map((m) => [m.matchId, m]))
    assert.equal(byId[zeroOfTwo.id].filledSlots, 0)
    assert.equal(byId[zeroOfTwo.id].requiredUmpires, 2)
    assert.equal(byId[oneOfTwo.id].filledSlots, 1)
    assert.equal(byId[oneOfTwo.id].requiredUmpires, 2)
    assert.equal(byId[twoOfTwo.id].filledSlots, 1)
    assert.equal(byId[twoOfTwo.id].requiredUmpires, 1, '2/2-equivalent: filled >= required, so this must read as fully staffed on the frontend')
    assert.equal(byId[noneRequired.id].requiredUmpires, 0)
    assert.equal(byId[noneRequired.id].totalSlots, 0, 'a required_umpires=0 match must have zero slot rows, never invented ones')
  } finally {
    await umpire.cleanup()
    await otherUmpire.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

test('currentUserAssigned reflects only the calling umpire\'s own assignment, and live/completed matches never appear', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('assigned-main')
  const otherUmpire = await approvedUmpire('assigned-other')
  const tag = uniqueTag()
  const city = `UGD Assigned City ${tag}`
  const fixture = await createGroundFixture({ label: 'assigned', ...NEAR, city })
  try {
    const mine = await fixture.createMatch(teams, { requiredUmpires: 2 })
    await json(`${server.baseUrl}/matches/${mine.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const theirs = await fixture.createMatch(teams, { requiredUmpires: 1 })
    await json(`${server.baseUrl}/matches/${theirs.id}/umpire-slots/apply`, { method: 'POST', token: otherUmpire.token })
    const live = await fixture.createMatch(teams, { requiredUmpires: 1, status: 'live' })
    const completed = await fixture.createMatch(teams, { requiredUmpires: 1, status: 'completed' })

    const { data } = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: umpire.token })
    const ground = data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    const ids = ground.matches.map((m) => m.matchId)

    assert.ok(!ids.includes(live.id), 'a live match must never appear')
    assert.ok(!ids.includes(completed.id), 'a completed match must never appear')

    const byId = Object.fromEntries(ground.matches.map((m) => [m.matchId, m]))
    assert.equal(byId[mine.id].currentUserAssigned, true, 'the calling umpire\'s own assignment must read true')
    assert.equal(byId[theirs.id].currentUserAssigned, false, 'another umpire\'s assignment must not leak as "mine"')
  } finally {
    await umpire.cleanup()
    await otherUmpire.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

test('empty states: anyGroundsExist is false with zero grounds nearby, true when a ground exists but has no upcoming matches', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('empty-states')
  const tag = uniqueTag()
  const city = `UGD Empty City ${tag}`
  const groundWithNoMatches = await createGroundFixture({ label: 'empty-no-matches', ...NEAR, city })
  try {
    const noneNearby = await json(`${server.baseUrl}/umpire/grounds/nearby?lat=${FAR.lat}&lng=${FAR.lng}&radiusKm=1`, { token: umpire.token })
    assert.equal(noneNearby.status, 200)
    assert.deepEqual(noneNearby.data.grounds, [])
    assert.equal(noneNearby.data.anyGroundsExist, false, 'truly nothing nearby must read anyGroundsExist:false')

    const groundExistsNoMatches = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: umpire.token })
    assert.equal(groundExistsNoMatches.status, 200)
    assert.deepEqual(groundExistsNoMatches.data.grounds, [])
    assert.equal(groundExistsNoMatches.data.anyGroundsExist, true, 'a ground that exists but has no upcoming matches must read anyGroundsExist:true')
  } finally {
    await umpire.cleanup()
    await groundWithNoMatches.cleanup()
    await server.close()
  }
})

test('photos/amenities are the ground\'s own real gallery/list, [] when empty', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('media')
  const tag = uniqueTag()
  const city = `UGD Media City ${tag}`
  const fixture = await createGroundFixture({ label: 'media', ...NEAR, city })
  await fixture.addPhoto(`photo-a-${tag}`)
  await fixture.addPhoto(`photo-b-${tag}`)
  await fixture.addAmenity(`Floodlights-${tag}`)
  try {
    await fixture.createMatch(teams, { requiredUmpires: 1 })
    const { data } = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: umpire.token })
    const ground = data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    assert.equal(ground.photos.length, 2, 'the full photo gallery must be returned, not just one primary photo')
    assert.deepEqual(new Set(ground.amenities), new Set([`Floodlights-${tag}`]))
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

test('concurrency: a race for the last slot yields one 201 and one 409, and a refetch of the discovery endpoint reflects the real post-race counts', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpireA = await approvedUmpire('race-a')
  const umpireB = await approvedUmpire('race-b')
  const tag = uniqueTag()
  const city = `UGD Race City ${tag}`
  const fixture = await createGroundFixture({ label: 'race', ...NEAR, city })
  try {
    const match = await fixture.createMatch(teams, { requiredUmpires: 1 })

    const [resA, resB] = await Promise.all([
      json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token }),
      json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireB.token }),
    ])
    const statuses = [resA.status, resB.status].sort()
    assert.deepEqual(statuses, [201, 409], 'exactly one applicant must win the single slot')

    const winnerToken = resA.status === 201 ? umpireA.token : umpireB.token
    const { data } = await json(`${server.baseUrl}/umpire/grounds/by-city?city=${encodeURIComponent(city)}`, { token: winnerToken })
    const ground = data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    const entry = ground.matches.find((m) => m.matchId === match.id)
    assert.equal(entry.filledSlots, 1, 'the discovery endpoint must reflect the real post-race fill count, not a stale/guessed one')
    assert.equal(entry.currentUserAssigned, true, 'the winner must read as assigned on refetch')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

// "Grounds for Umpire" default view — GET /umpire/grounds/all
test('all: unfiltered by city/distance — a ground far away with an upcoming match is included; access control matches the other two routes', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await approvedUmpire('all-basic')
  const pending = await makeUser({ label: 'all-gate-pending', playerType: 'umpire', requestStatuses: ['pending'] })
  const fixture = await createGroundFixture({ label: 'all-far', ...FAR })
  try {
    const match = await fixture.createMatch(teams, { requiredUmpires: 2 })

    const denied = await json(`${server.baseUrl}/umpire/grounds/all`, { token: pending.token })
    assert.equal(denied.status, 403)

    const res = await json(`${server.baseUrl}/umpire/grounds/all?limit=100`, { token: umpire.token })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const ground = res.data.grounds.find((g) => g.publicGroundId === fixture.ground.public_ground_id)
    assert.ok(ground, 'a ground far from any coordinate/city filter must still appear in the unfiltered "all" view')
    assert.equal(typeof ground.distanceKm, 'undefined', 'the unfiltered view has no origin point, so distanceKm is never fabricated')
    const entry = ground.matches.find((m) => m.matchId === match.id)
    assert.ok(entry)
    assert.equal(entry.filledSlots, 0)
  } finally {
    await umpire.cleanup()
    await pending.cleanup()
    await teams.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})

test('all: a ground with no upcoming matches is excluded, same rule as the city/nearby views', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('all-empty')
  const fixture = await createGroundFixture({ label: 'all-no-matches', ...NEAR })
  try {
    const res = await json(`${server.baseUrl}/umpire/grounds/all?limit=100`, { token: umpire.token })
    assert.equal(res.status, 200)
    assert.ok(!res.data.grounds.some((g) => g.publicGroundId === fixture.ground.public_ground_id))
  } finally {
    await umpire.cleanup()
    await fixture.cleanup()
    await server.close()
  }
})
