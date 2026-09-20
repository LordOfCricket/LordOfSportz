// Phase 6 (Umpire Module) — pre-match cancellation, the one confirmed-
// missing match lifecycle action from the Phase 5 audit. Real HTTP against
// the real app, same pattern as groundOwnerMatchLifecycle.integration.test.js
// (whose helpers this file mirrors locally, matching this codebase's own
// per-file-helpers convention).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
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

async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-cancel-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_proposals WHERE umpire_user_id = $1 OR proposed_by = $1', [user.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_notifications WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-cancel-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM umpire_proposals WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function notificationCount(userId, type, matchId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = $2 AND related_match_id = $3`, [
    userId,
    type,
    matchId,
  ])
  return rows[0].n
}

function cancelUrl(server, gf, matchId) {
  return `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/cancel`
}

test('cancel: full happy path — assigned umpire notified + released, pending proposal expired + its umpire notified, audit columns set', async () => {
  const server = await startTestApp()
  const gf = await createGround('happy')
  const owner = await createUser('happy-owner')
  const assignedUmpire = await createUser('happy-assigned', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const proposedUmpire = await createUser('happy-proposed', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 2,
    })
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: assignedUmpire.token })
    assert.equal(applied.status, 201)

    await elevate(owner)
    const slotsRes = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots`, {
      cookie: owner.cookie,
    })
    const openSlot = slotsRes.data.slots.find((s) => s.status === 'AVAILABLE')
    const propose = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${openSlot.id}/propose`,
      { method: 'POST', cookie: owner.cookie, body: { umpireUserId: proposedUmpire.id, incentiveAmount: 0 } },
    )
    assert.equal(propose.status, 201, JSON.stringify(propose.data))

    const cancelled = await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie, body: { reason: 'Ground waterlogged' } })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))
    assert.equal(cancelled.data.match.status, 'cancelled')

    const matchRow = (await pool.query('SELECT cancelled_at, cancelled_by, cancellation_reason FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.ok(matchRow.cancelled_at, 'cancelled_at must be set')
    assert.equal(matchRow.cancelled_by, owner.id)
    assert.equal(matchRow.cancellation_reason, 'Ground waterlogged')

    const slotRow = (await pool.query('SELECT status FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2', [match.id, assignedUmpire.id])).rows[0]
    assert.equal(slotRow.status, 'CANCELLED')

    // Phase 7 (UX audit fix) — the umpire's own assignment list must be able
    // to tell "the ground owner cancelled the whole match" apart from a
    // self-cancellation, and must carry the reason if one was given.
    const myAssignments = await json(`${server.baseUrl}/umpire/assignments`, { token: assignedUmpire.token })
    assert.equal(myAssignments.status, 200)
    const myCancelledSlot = myAssignments.data.assignments.find((a) => a.match_id === match.id)
    assert.equal(myCancelledSlot.status, 'CANCELLED')
    assert.equal(myCancelledSlot.match_status, 'cancelled', 'match_status must distinguish an owner-cancelled match from a self-cancelled slot')
    assert.equal(myCancelledSlot.cancellation_reason, 'Ground waterlogged')

    assert.equal(await notificationCount(assignedUmpire.id, 'MATCH_CANCELLED', match.id), 1, 'the assigned umpire must be notified')
    assert.equal(await notificationCount(proposedUmpire.id, 'UMPIRE_PROPOSAL_EXPIRED', match.id), 1, 'the proposed (not-yet-accepted) umpire must be notified their offer is gone')

    const proposalRow = (await pool.query('SELECT status FROM umpire_proposals WHERE match_id = $1 AND umpire_user_id = $2', [match.id, proposedUmpire.id])).rows[0]
    assert.equal(proposalRow.status, 'EXPIRED')
  } finally {
    await assignedUmpire.cleanup()
    await proposedUmpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('cancel: does NOT count against the umpire\'s reliability score — a ground-owner cancellation is not the umpire\'s fault', async () => {
  const server = await startTestApp()
  const gf = await createGround('reliability')
  const owner = await createUser('reliability-owner')
  const umpire = await createUser('reliability-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const before = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(before.data.profile.matches_cancelled, 0)

    await elevate(owner)
    const cancelled = await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))

    const after = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(after.data.profile.matches_cancelled, 0, 'a match the GROUND OWNER cancelled must never count as the umpire\'s own cancellation')

    const eventRows = await pool.query(`SELECT event_type FROM umpire_assignment_events WHERE umpire_user_id = $1 AND match_id = $2`, [umpire.id, match.id])
    assert.ok(
      eventRows.rows.every((r) => r.event_type !== 'CANCELLED'),
      'no CANCELLED assignment-event row should be written for a ground-owner-initiated match cancellation',
    )
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('cancel: releases the umpire\'s availability — they can now accept a previously-overlapping match', async () => {
  const server = await startTestApp()
  const gf = await createGround('release')
  const owner = await createUser('release-owner')
  const umpire = await createUser('release-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const sameTime = new Date(Date.now() + 3 * 86400000).toISOString()
    const matchA = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, matchDate: sameTime, groundId: gf.ground.id, requiredUmpires: 1 })
    const matchB = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, matchDate: sameTime, groundId: gf.ground.id, requiredUmpires: 1 })

    assert.equal((await json(`${server.baseUrl}/matches/${matchA.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })).status, 201)
    const blockedByOverlap = await json(`${server.baseUrl}/matches/${matchB.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(blockedByOverlap.status, 409, 'sanity check: the two matches genuinely overlap')
    assert.equal(blockedByOverlap.data.code, 'OVERLAPPING_ASSIGNMENT')

    await elevate(owner)
    const cancelled = await json(cancelUrl(server, gf, matchA.id), { method: 'POST', cookie: owner.cookie })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))

    const retried = await json(`${server.baseUrl}/matches/${matchB.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(retried.status, 201, 'cancelling matchA must free the umpire up for the previously-overlapping matchB')
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('cancel: idempotent — a second cancel on an already-cancelled match is a clean no-op, no duplicate notification', async () => {
  const server = await startTestApp()
  const gf = await createGround('idempotent')
  const owner = await createUser('idempotent-owner')
  const umpire = await createUser('idempotent-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    await elevate(owner)
    const first = await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie })
    assert.equal(first.status, 200)
    const second = await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie })
    assert.equal(second.status, 200, JSON.stringify(second.data))
    assert.equal(second.data.match.status, 'cancelled')

    assert.equal(await notificationCount(umpire.id, 'MATCH_CANCELLED', match.id), 1, 'must not double-notify on the idempotent retry')
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('cancel: cannot cancel a LIVE match (409); a non-owner (404) and a plain umpire (403) cannot cancel at all', async () => {
  const server = await startTestApp()
  const gf = await createGround('guard')
  const owner = await createUser('guard-owner')
  const stranger = await createUser('guard-stranger')
  const umpire = await createUser('guard-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 0,
    })
    for (const p of fx.squadA.slice(0, 2)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB.slice(0, 2)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })

    const asUmpire = await json(cancelUrl(server, gf, match.id), { method: 'POST', token: umpire.token })
    assert.equal(asUmpire.status, 403, 'an approved umpire has no MATCH_MANAGE permission and must be denied')

    const asStranger = await json(cancelUrl(server, gf, match.id), { method: 'POST', token: stranger.token })
    assert.equal(asStranger.status, 403, 'a user with no ground membership at all must be denied')

    await elevate(owner)
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const liveCancel = await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie })
    assert.equal(liveCancel.status, 409, JSON.stringify(liveCancel.data))
    assert.equal(liveCancel.data.code, 'MATCH_NOT_ELIGIBLE')
  } finally {
    await umpire.cleanup()
    await stranger.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('cancel: a cancelled match disappears from umpire self-apply discovery', async () => {
  const server = await startTestApp()
  const gf = await createGround('discovery')
  const owner = await createUser('discovery-owner')
  const umpire = await createUser('discovery-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    const before = await json(`${server.baseUrl}/umpire/matches/available`, { token: umpire.token })
    assert.ok(before.data.matches.some((m) => m.id === match.id), 'sanity check: the match is discoverable before cancellation')

    await elevate(owner)
    await json(cancelUrl(server, gf, match.id), { method: 'POST', cookie: owner.cookie })

    const after = await json(`${server.baseUrl}/umpire/matches/available`, { token: umpire.token })
    assert.ok(!after.data.matches.some((m) => m.id === match.id), 'a cancelled match must disappear from umpire discovery')
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})
