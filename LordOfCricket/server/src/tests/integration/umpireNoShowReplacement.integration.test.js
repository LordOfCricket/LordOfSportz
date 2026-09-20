// No-show / replacement (Phase 23, Workstreams F/G/H) — Ground Owner can
// mark an ASSIGNED umpire as NO_SHOW, then assign a replacement through the
// SAME eligibility gate applyForSlot uses (approved, no overlap, available),
// never a bare guarded UPDATE. Scoring access transfers automatically via
// the existing live requireMatchScorer check — no auth code changes needed.
// Real HTTP against the real app, same pattern as
// groundOwnerMatchLifecycle.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { createTeamsFixture } from './fixtures.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

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

async function json(url, { method = 'GET', token, cookie, body } = {}) {
  const authHeaders = cookie ? { Cookie: cookie } : token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

// Phase 6 — requireGroundRole/requireGroundPermission's GROUND_OWNER branch
// now requires req.mfaVerified. `elevate` mints a REAL, already-MFA-verified
// session cookie — see helpers/mfaFixtures.js (this file isn't testing MFA,
// only no-show/replacement).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-noshow-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-noshow-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeAssignedMatch(server, ground, umpire, teams) {
  const match = await matchService.createMatch({
    teamAId: teams.teamAId,
    teamBId: teams.teamBId,
    matchDate: new Date(Date.now() + 86400000).toISOString(),
    groundId: ground.id,
    requiredUmpires: 1,
  })
  const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
  assert.equal(applied.status, 201, JSON.stringify(applied.data))
  return { match, slotId: applied.data.slot.id }
}

test('ground owner marks an ASSIGNED umpire as NO_SHOW: slot transitions, event logged, umpire notified, scoring access revoked', async () => {
  const server = await startTestApp()
  const gf = await createGround('mark')
  const owner = await createUser('mark-owner')
  const umpire = await createUser('mark-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const { match, slotId } = await makeAssignedMatch(server, gf.ground, umpire, teams)

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.slot.status, 'NO_SHOW')

    const events = await pool.query(`SELECT event_type FROM umpire_assignment_events WHERE match_umpire_slot_id = $1 ORDER BY recorded_at`, [slotId])
    assert.deepEqual(
      events.rows.map((r) => r.event_type),
      ['ASSIGNED', 'NO_SHOW'],
    )

    const notified = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_NO_SHOW'`, [umpire.id])
    assert.equal(notified.rows[0].n, 1)

    // Scoring access revoked (requireMatchScorer re-checks hasActiveSlotAssignment live).
    const toss = await json(`${server.baseUrl}/matches/${match.id}/toss`, {
      method: 'PATCH',
      token: umpire.token,
      body: { tossWinnerId: teams.teamAId, tossDecision: 'bat' },
    })
    assert.equal(toss.status, 403)
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a non-owner cannot mark a no-show (404); marking a slot that is not ASSIGNED is rejected', async () => {
  const server = await startTestApp()
  const gf = await createGround('unauthorized')
  const owner = await createUser('unauthorized-owner')
  const intruder = await createUser('unauthorized-intruder')
  const umpire = await createUser('unauthorized-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const { match, slotId } = await makeAssignedMatch(server, gf.ground, umpire, teams)

    // requireGroundRole('GROUND_OWNER') rejects a non-member with 403 before
    // this route's own handler ever runs — same as every other ground-owner
    // endpoint (groundOwnerMatch.integration.test.js's own "no membership"
    // tests assert this exact status for a real, existing ground).
    const asIntruder = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`,
      { method: 'POST', token: intruder.token },
    )
    assert.equal(asIntruder.status, 403)

    const first = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(first.status, 200)

    const second = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(second.status, 409, JSON.stringify(second.data))
    assert.equal(second.data.code, 'SLOT_NOT_ELIGIBLE')
  } finally {
    await intruder.cleanup()
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('eligible replacements: excludes an unavailable candidate and a candidate with a conflicting match, includes a genuinely eligible one', async () => {
  const server = await startTestApp()
  const gf = await createGround('eligible')
  const owner = await createUser('eligible-owner')
  const noShowUmpire = await createUser('eligible-noshow', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const unavailableCandidate = await createUser('eligible-unavailable', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const busyCandidate = await createUser('eligible-busy', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const goodCandidate = await createUser('eligible-good', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await createTeamsFixture()
  const teams2 = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const { match, slotId } = await makeAssignedMatch(server, gf.ground, noShowUmpire, teams)
    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })

    // unavailableCandidate marks the whole day of the match unavailable.
    const matchDateStr = new Date(match.match_date).toISOString().slice(0, 10)
    await json(`${server.baseUrl}/umpire/availability/date`, {
      method: 'PATCH',
      token: unavailableCandidate.token,
      body: { date: matchDateStr, isAvailable: false },
    })

    // busyCandidate is already assigned to a strictly overlapping different match.
    const conflictingMatch = await matchService.createMatch({
      teamAId: teams2.teamAId,
      teamBId: teams2.teamBId,
      matchDate: match.match_date,
      oversPerInnings: 20,
      requiredUmpires: 1,
    })
    const busyApply = await json(`${server.baseUrl}/matches/${conflictingMatch.id}/umpire-slots/apply`, { method: 'POST', token: busyCandidate.token })
    assert.equal(busyApply.status, 201, JSON.stringify(busyApply.data))

    const res = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/eligible-replacements`,
      { cookie: owner.cookie },
    )
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const ids = res.data.candidates.map((c) => c.id)
    assert.ok(ids.includes(goodCandidate.id), 'the genuinely eligible candidate must be listed')
    assert.ok(!ids.includes(unavailableCandidate.id), 'an unavailable candidate must not be listed')
    assert.ok(!ids.includes(busyCandidate.id), 'a candidate with a conflicting match must not be listed')
    assert.ok(!ids.includes(noShowUmpire.id), 'the no-show umpire themselves must not be their own replacement candidate implicitly re-claiming the same match differently')
  } finally {
    await goodCandidate.cleanup()
    await busyCandidate.cleanup()
    await unavailableCandidate.cleanup()
    await noShowUmpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await teams2.cleanup()
    await server.close()
  }
})

test('assigning a replacement: new umpire gets ASSIGNED + scoring access, history preserves both the no-show and the replacement, no-show umpire cannot score', async () => {
  const server = await startTestApp()
  const gf = await createGround('assign')
  const owner = await createUser('assign-owner')
  const noShowUmpire = await createUser('assign-noshow', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const replacement = await createUser('assign-replacement', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const { match, slotId } = await makeAssignedMatch(server, gf.ground, noShowUmpire, teams)
    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })

    const assign = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: owner.cookie, body: { newUmpireUserId: replacement.id } },
    )
    assert.equal(assign.status, 200, JSON.stringify(assign.data))
    assert.equal(assign.data.slot.status, 'ASSIGNED')
    assert.equal(assign.data.slot.umpire_user_id, replacement.id)

    // The replacement can now set the toss (scoring access); the no-show umpire cannot.
    const asReplacement = await json(`${server.baseUrl}/matches/${match.id}/toss`, {
      method: 'PATCH',
      token: replacement.token,
      body: { tossWinnerId: teams.teamAId, tossDecision: 'bat' },
    })
    assert.equal(asReplacement.status, 200, JSON.stringify(asReplacement.data))

    const asNoShow = await json(`${server.baseUrl}/matches/${match.id}/finalize`, { method: 'POST', token: noShowUmpire.token })
    assert.equal(asNoShow.status, 403)

    const history = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-history`, {
      cookie: owner.cookie,
    })
    assert.equal(history.status, 200)
    const timeline = history.data.events.map((e) => ({ type: e.event_type, umpireId: e.umpire_user_id }))
    assert.deepEqual(timeline, [
      { type: 'ASSIGNED', umpireId: noShowUmpire.id },
      { type: 'NO_SHOW', umpireId: noShowUmpire.id },
      { type: 'REPLACEMENT_ASSIGNED', umpireId: replacement.id },
    ])
  } finally {
    await replacement.cleanup()
    await noShowUmpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('assigning a replacement rejects a candidate who is not an approved umpire, and one with a conflicting match', async () => {
  const server = await startTestApp()
  const gf = await createGround('reject')
  const owner = await createUser('reject-owner')
  const noShowUmpire = await createUser('reject-noshow', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const normalPlayer = await createUser('reject-player')
  const busyCandidate = await createUser('reject-busy', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await createTeamsFixture()
  const teams2 = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const { match, slotId } = await makeAssignedMatch(server, gf.ground, noShowUmpire, teams)
    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })

    const withNormalPlayer = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: owner.cookie, body: { newUmpireUserId: normalPlayer.id } },
    )
    assert.equal(withNormalPlayer.status, 403, JSON.stringify(withNormalPlayer.data))
    assert.equal(withNormalPlayer.data.code, 'NOT_APPROVED_UMPIRE')

    const conflictingMatch = await matchService.createMatch({
      teamAId: teams2.teamAId,
      teamBId: teams2.teamBId,
      matchDate: match.match_date,
      oversPerInnings: 20,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${conflictingMatch.id}/umpire-slots/apply`, { method: 'POST', token: busyCandidate.token })

    const withBusy = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: owner.cookie, body: { newUmpireUserId: busyCandidate.id } },
    )
    assert.equal(withBusy.status, 409, JSON.stringify(withBusy.data))
    assert.equal(withBusy.data.code, 'OVERLAPPING_ASSIGNMENT')
  } finally {
    await busyCandidate.cleanup()
    await normalPlayer.cleanup()
    await noShowUmpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await teams2.cleanup()
    await server.close()
  }
})
