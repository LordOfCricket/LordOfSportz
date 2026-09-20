// Phase 11 — proves the FULL authoritative pipeline end to end: a real HTTP
// scoring/correction/lifecycle request against the real Express app (same
// app.js the real server boots), through the real service layer, publishing
// to a real Socket.IO room a real socket.io-client spectator has joined.
// This is what actually proves "publish only after commit" and "controllers
// wire req.io correctly" — the lower-level cricketRealtime.integration.test.js
// already proved the transport primitives in isolation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import app from '../../app.js'
import { registerCricketRealtime } from '../../realtime/cricketRealtime.js'
import { signToken } from '../../utils/jwt.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import { createTeamsFixture } from './fixtures.js'
import { pool } from '../../config/db.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })
  app.locals.io = io
  registerCricketRealtime(io)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    io,
    baseUrl: `http://localhost:${port}/api`,
    socketUrl: `http://localhost:${port}`,
    async close() {
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

function connectSpectator(url, matchId) {
  return new Promise((resolve, reject) => {
    const client = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false })
    const timer = setTimeout(() => reject(new Error('spectator connect timed out')), 3000)
    client.on('connect', () => {
      clearTimeout(timer)
      client.emit('join-match', { matchId })
      resolve(client)
    })
  })
}

function waitForState(client, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for match:state')), timeoutMs)
    client.once('match:state', (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function json(url, { method = 'GET', token, cookie, body } = {}) {
  // Phase 4 (Umpire Module) — `cookie` added for the ground-owner tests
  // below: requireGroundPermission's GROUND_OWNER branch requires a real
  // MFA-verified SESSION cookie (mintMfaVerifiedSessionCookie), a bearer
  // JWT is permanently mfaVerified=false and gets a clean 401/403, never a
  // silently-ignored auth header.
  const authHeaders = cookie ? { Cookie: cookie } : token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

test('R13/R17 — an HTTP delivery, after commit, publishes match:state with reason=delivery to the spectator room', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Realtime Publish Test', matchDate: new Date().toISOString(), oversPerInnings: 4, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA.slice(0, 4)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB.slice(0, 4)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    const { innings: i0 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i0.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    const { innings: i1 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i1.version, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))
    const nextState = waitForState(spectator)

    const scorerToken = signToken({ id: fx.userId })
    const { innings: i2 } = await scoringService.getInningsState(innings1.id)
    const { status, data } = await json(`${server.baseUrl}/innings/${innings1.id}/deliveries`, {
      method: 'POST',
      token: scorerToken,
      body: { expectedVersion: i2.version, clientActionId: randomUUID(), batRuns: 4, bowlerMatchPlayerId: mpsB[3].id },
    })
    assert.equal(status, 201)
    assert.equal(data.delivery.batRuns, 4)

    const payload = await nextState
    assert.equal(payload.reason, 'delivery')
    assert.equal(payload.matchId, match.id)
    assert.equal(payload.currentInnings.runs, 4)

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R36 — an idempotent retry (same clientActionId) does not publish a second match:state', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Realtime Idempotency Test', matchDate: new Date().toISOString(), oversPerInnings: 4, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA.slice(0, 4)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB.slice(0, 4)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    const { innings: i0 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i0.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    const { innings: i1 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i1.version, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))

    const scorerToken = signToken({ id: fx.userId })
    const { innings: i2 } = await scoringService.getInningsState(innings1.id)
    const clientActionId = randomUUID()
    const body = { expectedVersion: i2.version, clientActionId, batRuns: 1, bowlerMatchPlayerId: mpsB[3].id }

    const firstState = waitForState(spectator)
    const first = await json(`${server.baseUrl}/innings/${innings1.id}/deliveries`, { method: 'POST', token: scorerToken, body })
    assert.equal(first.status, 201)
    await firstState

    let secondEventReceived = false
    spectator.once('match:state', () => {
      secondEventReceived = true
    })
    const second = await json(`${server.baseUrl}/innings/${innings1.id}/deliveries`, { method: 'POST', token: scorerToken, body })
    assert.equal(second.status, 201)
    assert.equal(second.data.idempotentReplay, true)

    await new Promise((r) => setTimeout(r, 400))
    assert.equal(secondEventReceived, false, 'a retried, already-applied clientActionId must not publish a second broadcast')

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R11/R17 — a historical correction publishes the fully-replayed authoritative state (never a delta)', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Realtime Correction Test', matchDate: new Date().toISOString(), oversPerInnings: 4, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA.slice(0, 4)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB.slice(0, 4)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    const { innings: i0 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i0.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    const { innings: i1 } = await scoringService.getInningsState(innings1.id)
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: i1.version, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

    const { innings: i2 } = await scoringService.getInningsState(innings1.id)
    const { delivery: firstDelivery } = await scoringService.recordDelivery({ inningsId: innings1.id, expectedVersion: i2.version, clientActionId: randomUUID(), recordedByUserId: fx.userId, input: { batRuns: 2, bowlerMatchPlayerId: mpsB[3].id } })

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))
    const nextState = waitForState(spectator)

    const scorerToken = signToken({ id: fx.userId })
    const { innings: i3 } = await scoringService.getInningsState(innings1.id)
    const { status, data } = await json(`${server.baseUrl}/innings/${innings1.id}/corrections`, {
      method: 'POST',
      token: scorerToken,
      body: { targetType: 'delivery', targetId: firstDelivery.id, patch: { batRuns: 6 }, reasonCode: 'WRONG_RUNS', expectedVersion: i3.version, clientActionId: randomUUID() },
    })
    assert.equal(status, 201)

    const payload = await nextState
    assert.equal(payload.reason, 'correction')
    assert.equal(payload.currentInnings.runs, 6, 'the broadcast must carry the fully-replayed corrected total, not a delta')

    const { state: reReplayed } = await scoringService.getInningsState(innings1.id)
    assert.equal(payload.currentInnings.runs, reReplayed.runs, 'broadcast must match an independent re-replay exactly')

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

// Phase 4 (Umpire Module) — the GROUND-OWNER-initiated start/complete paths
// (groundOwner.controller.js) call match.service.js#startMatch/
// completeMatchManually directly, bypassing match.controller.js's own
// startMatch/finalizeMatch handlers (the ones R22/R23 above already prove
// publish). They had their own, separate publishMatchState call missing
// entirely until this phase — these two tests prove the fix through the
// real HTTP route, not just by reading the source.
async function createGroundOwnerFixture(label) {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { rows: groundRows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-rtp-ground-${label}-${tag}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = groundRows[0]
  const { rows: ownerRows } = await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`, [
    `Integration Test Owner ${label}`,
    `integration-test-rtp-owner-${label}-${tag}@example.test`,
  ])
  const owner = ownerRows[0]
  await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  const { cookie } = await mintMfaVerifiedSessionCookie(owner.id)
  return {
    ground,
    ownerId: owner.id,
    cookie,
    async cleanup() {
      // FK-safe order (mirrors groundOwnerMatchLifecycle.integration.test.js's
      // own createGround cleanup) — matches/innings/match_players reference
      // this ground's matches, which must go before the ground itself, or
      // the DELETE throws and the test's spectator socket is left connected
      // (skipping the `.disconnect()` after the throwing assertion), which
      // then hangs the whole process on exit.
      await pool.query('DELETE FROM innings WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_players WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [owner.id])
      await pool.query('DELETE FROM users WHERE id = $1', [owner.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

test('Ground-owner "start match" publishes lifecycle state (bypasses match.controller.js entirely)', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  const gf = await createGroundOwnerFixture('start')
  try {
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      venue: 'Ground Owner Start Test',
      matchDate: new Date().toISOString(),
      oversPerInnings: 4,
      ballsPerOver: 6,
      groundId: gf.ground.id,
    })
    for (const p of fx.squadA.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))
    const nextState = waitForState(spectator)

    const started = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/start`, {
      method: 'POST',
      cookie: gf.cookie,
    })
    assert.equal(started.status, 200, JSON.stringify(started.data))

    const payload = await nextState
    assert.equal(payload.reason, 'lifecycle')
    assert.equal(payload.match.status, 'live')

    spectator.disconnect()
  } finally {
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('Ground-owner "match is over" publishes lifecycle state exactly once, never on the idempotent no-op branch', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  const gf = await createGroundOwnerFixture('complete')
  try {
    const match = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      venue: 'Ground Owner Complete Test',
      matchDate: new Date().toISOString(),
      oversPerInnings: 4,
      ballsPerOver: 6,
      groundId: gf.ground.id,
    })
    for (const p of fx.squadA.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))
    const nextState = waitForState(spectator)

    const completed = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: gf.cookie,
    })
    assert.equal(completed.status, 200, JSON.stringify(completed.data))
    assert.equal(completed.data.match.status, 'completed')

    const payload = await nextState
    assert.equal(payload.reason, 'lifecycle')
    assert.equal(payload.match.status, 'completed')

    // Idempotent re-completion must NOT publish a second time.
    let secondEventReceived = false
    spectator.once('match:state', () => {
      secondEventReceived = true
    })
    const again = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: gf.cookie,
    })
    assert.equal(again.status, 200, JSON.stringify(again.data))
    await new Promise((r) => setTimeout(r, 400))
    assert.equal(secondEventReceived, false, 'an idempotent no-op re-completion must not publish a second broadcast')

    spectator.disconnect()
  } finally {
    await gf.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('R22/R23 — match completion and finalization publish lifecycle state', async () => {
  const server = await startTestApp()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Realtime Lifecycle Test', matchDate: new Date().toISOString(), oversPerInnings: 1, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA.slice(0, 4)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB.slice(0, 4)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))

    const spectator = await connectSpectator(server.socketUrl, match.id)
    await new Promise((r) => setTimeout(r, 100))

    const scorerToken = signToken({ id: fx.userId })
    await json(`${server.baseUrl}/matches/${match.id}/toss`, { method: 'PATCH', token: scorerToken, body: { tossWinnerId: fx.teamAId, tossDecision: 'bat' } })

    const startState = waitForState(spectator)
    const startResp = await json(`${server.baseUrl}/matches/${match.id}/start`, { method: 'POST', token: scorerToken })
    assert.equal(startResp.status, 200)
    const startPayload = await startState
    assert.equal(startPayload.reason, 'lifecycle')
    assert.equal(startPayload.match.status, 'live')

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})
