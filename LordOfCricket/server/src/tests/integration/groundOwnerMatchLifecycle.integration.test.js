// Ground Owner match-lifecycle control: umpire staffing detail (name, no
// phone — doesn't exist in the schema), "Match is Starting" (reuses
// match.service.js::startMatch verbatim), and "Match is Over" (new
// match.service.js::completeMatchManually — idempotent no-op if the scoring
// engine already auto-completed the match, otherwise a manual NO_RESULT
// transition). Real HTTP against the real app, same pattern as every other
// integration test in this codebase.
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
import { createTeamsFixture, bowl, bowlDots } from './fixtures.js'
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

// Phase 6 — requireGroundPermission's GROUND_OWNER branch now requires
// req.mfaVerified. `elevate` mints a REAL, already-MFA-verified session
// cookie — see helpers/mfaFixtures.js. Calls that fail on a missing
// membership (cross-ground/wrong-owner tests) never reach the MFA check,
// so those keep the plain JWT.
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-gol-${label}-${uniqueTag()}@example.test`, role, playerType],
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
    `integration-test-gol-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM innings WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_players WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
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

test('umpire-slots: ground owner sees the real assigned umpire name (no phone — never fabricated); a non-owner gets 404', async () => {
  const server = await startTestApp()
  const gf = await createGround('slots')
  const owner = await createUser('slots-owner')
  const stranger = await createUser('slots-stranger')
  const umpire = await createUser('slots-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const applyRes = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applyRes.status, 201)

    await elevate(owner)
    const asOwner = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots`, {
      cookie: owner.cookie,
    })
    assert.equal(asOwner.status, 200)
    const assignedSlot = asOwner.data.slots.find((s) => s.status === 'ASSIGNED')
    const umpireRow = (await pool.query('SELECT name FROM users WHERE id = $1', [umpire.id])).rows[0]
    assert.equal(assignedSlot.umpire_name, umpireRow.name)
    assert.ok(!JSON.stringify(asOwner.data).match(/phone/i), 'no phone field must ever appear — it does not exist in the schema')

    const asStranger = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots`, {
      token: stranger.token,
    })
    assert.equal(asStranger.status, 403, 'a user with no ground membership is denied by requireGroundRole before ever reaching the match check')
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await stranger.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('owner CANNOT see umpire-slots for a match on a ground they do not own, even with a valid matchId', async () => {
  const server = await startTestApp()
  const gfA = await createGround('slots-sec-a')
  const gfB = await createGround('slots-sec-b')
  const ownerA = await createUser('slots-sec-owner-a')
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gfA.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })
    const matchOnB = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gfB.ground.id,
      requiredUmpires: 1,
    })

    await elevate(ownerA)
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gfA.ground.public_ground_id}/matches/${matchOnB.id}/umpire-slots`, {
      cookie: ownerA.cookie,
    })
    assert.equal(res.status, 404, 'a match belonging to a DIFFERENT ground must 404, never confirm it exists elsewhere')
  } finally {
    await ownerA.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('start: full happy path — toss set by assigned umpire, owner starts, match goes LIVE, umpire is notified, unassigned/normal-player scoring access is denied throughout', async () => {
  const server = await startTestApp()
  const gf = await createGround('start-happy')
  const owner = await createUser('start-happy-owner')
  const umpire = await createUser('start-happy-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const otherUmpire = await createUser('start-happy-other-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const player = await createUser('start-happy-player', { playerType: 'team_player' })
  const fx = await createTeamsFixture({ squadSize: 3 })
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
      oversPerInnings: 5,
    })
    for (const p of fx.squadA) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })

    assert.equal((await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })).status, 201)

    // Scoring access before start (assigned/unassigned/normal-player), via a
    // real requireMatchScorer-gated route (toss-setting).
    const tossBody = { tossWinnerId: fx.teamAId, tossDecision: 'bat' }
    const unassignedTry = await json(`${server.baseUrl}/matches/${match.id}/toss`, { method: 'PATCH', token: otherUmpire.token, body: tossBody })
    assert.equal(unassignedTry.status, 403, 'an approved umpire NOT assigned to this match must be denied')
    const playerTry = await json(`${server.baseUrl}/matches/${match.id}/toss`, { method: 'PATCH', token: player.token, body: tossBody })
    assert.equal(playerTry.status, 403, 'a normal player must be denied')

    const tossSet = await json(`${server.baseUrl}/matches/${match.id}/toss`, { method: 'PATCH', token: umpire.token, body: tossBody })
    assert.equal(tossSet.status, 200, JSON.stringify(tossSet.data))

    // Ground owner starts the match — NOT the umpire, NOT via /matches/:id/start.
    await elevate(owner)
    const started = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/start`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')

    const notified = await notificationCount(umpire.id, 'MATCH_STARTING', match.id)
    assert.equal(notified, 1, 'the assigned umpire must receive exactly one MATCH_STARTING notification')
  } finally {
    await umpire.cleanup()
    await otherUmpire.cleanup()
    await player.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('start: a non-owner cannot start a match on someone else\'s ground (404); an already-live match cannot be started again (409)', async () => {
  const server = await startTestApp()
  const gfA = await createGround('start-sec-a')
  const gfB = await createGround('start-sec-b')
  const ownerA = await createUser('start-sec-owner-a')
  const ownerB = await createUser('start-sec-owner-b')
  const umpire = await createUser('start-sec-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture({ squadSize: 3 })
  try {
    await createMembership({ groundId: gfA.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })
    await createMembership({ groundId: gfB.ground.id, userId: ownerB.id, role: 'GROUND_OWNER' })
    const matchOnB = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gfB.ground.id,
      requiredUmpires: 0,
    })

    await elevate(ownerA)
    const wrongOwner = await json(`${server.baseUrl}/ground-owner/grounds/${gfA.ground.public_ground_id}/matches/${matchOnB.id}/start`, {
      method: 'POST',
      cookie: ownerA.cookie,
    })
    assert.equal(wrongOwner.status, 404)

    // Now correctly start it via its real owner, then try to start again.
    for (const p of fx.squadA) await scoringService.addMatchPlayer({ matchId: matchOnB.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB) await scoringService.addMatchPlayer({ matchId: matchOnB.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(matchOnB.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })

    await elevate(ownerB)
    const firstStart = await json(`${server.baseUrl}/ground-owner/grounds/${gfB.ground.public_ground_id}/matches/${matchOnB.id}/start`, {
      method: 'POST',
      cookie: ownerB.cookie,
    })
    assert.equal(firstStart.status, 200, JSON.stringify(firstStart.data))

    const secondStart = await json(`${server.baseUrl}/ground-owner/grounds/${gfB.ground.public_ground_id}/matches/${matchOnB.id}/start`, {
      method: 'POST',
      cookie: ownerB.cookie,
    })
    assert.equal(secondStart.status, 409, 'an already-live match cannot be started again')
  } finally {
    await umpire.cleanup()
    await ownerA.cleanup()
    await ownerB.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('complete: manual completion on a still-live match transitions to COMPLETED with NO_RESULT, notifies the assigned umpire, revokes scoring access, and preserves assignment history', async () => {
  const server = await startTestApp()
  const gf = await createGround('complete-manual')
  const owner = await createUser('complete-manual-owner')
  const umpire = await createUser('complete-manual-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture({ squadSize: 3 })
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    for (const p of fx.squadA) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await elevate(owner)
    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/start`, { method: 'POST', cookie: owner.cookie })

    const completed = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(completed.status, 200, JSON.stringify(completed.data))
    assert.equal(completed.data.match.status, 'completed')
    assert.equal(completed.data.match.result_type, 'NO_RESULT')
    assert.equal(completed.data.match.winner_team_id, null)

    const notified = await notificationCount(umpire.id, 'MATCH_COMPLETED', match.id)
    assert.equal(notified, 1)

    // Scoring access revoked — the same toss route now 403s (status no
    // longer in requireMatchScorer's default allowedStatuses).
    const tossAfter = await json(`${server.baseUrl}/matches/${match.id}/toss`, {
      method: 'PATCH',
      token: umpire.token,
      body: { tossWinnerId: fx.teamAId, tossDecision: 'bat' },
    })
    assert.equal(tossAfter.status, 403)

    // Assignment history intact — the slot is not deleted/reset, and (Phase
    // 23) now correctly reflects officiating credit: COMPLETED, not stuck
    // at ASSIGNED forever.
    const { rows } = await pool.query('SELECT status, umpire_user_id FROM match_umpire_slots WHERE match_id = $1', [match.id])
    assert.equal(rows[0].status, 'COMPLETED')
    assert.equal(rows[0].umpire_user_id, umpire.id)
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('complete: cannot complete a match that is still upcoming (409)', async () => {
  const server = await startTestApp()
  const gf = await createGround('complete-upcoming')
  const owner = await createUser('complete-upcoming-owner')
  const fx = await createTeamsFixture()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 0,
    })

    await elevate(owner)
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(res.status, 409)
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('complete: idempotent no-op when the scoring engine already auto-completed the match with a real result — never double-transitions, never overwrites the real result, never double-notifies', async () => {
  const server = await startTestApp()
  const gf = await createGround('complete-idempotent')
  const owner = await createUser('complete-idempotent-owner')
  const umpire = await createUser('complete-idempotent-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      matchDate: new Date().toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
      oversPerInnings: 1,
      ballsPerOver: 6,
    })
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)

    // Play a real, short (1 over/side) match out to a genuine RUNS result via
    // the actual scoring engine — the same maybeCompleteInnings path the
    // audit already verified correct.
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    await bowl(innings1.id, mpsB[0], { batRuns: 6 })
    await bowlDots(innings1.id, [mpsB[0]], 5) // completes over 1 -> innings 1 done (1 over/side)

    const innings2 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
    await bowlDots(innings2.id, [mpsA[0]], 6) // never reaches target=7 -> team A wins by runs

    const beforeRow = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.equal(beforeRow.status, 'completed', 'sanity check: scoring must have already auto-completed the match')
    assert.equal(beforeRow.result_type, 'RUNS')
    assert.equal(beforeRow.winner_team_id, fx.teamAId)

    await elevate(owner)
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.match.result_type, 'RUNS', 'the real scoring-derived result must never be overwritten by the manual NO_RESULT path')
    assert.equal(res.data.match.winner_team_id, fx.teamAId)

    const notified = await notificationCount(umpire.id, 'MATCH_COMPLETED', match.id)
    assert.equal(notified, 0, 'the idempotent no-op branch must never send a duplicate MATCH_COMPLETED notification')
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})
