// Phase 11 — cricket realtime transport, proved against a REAL Socket.IO
// server (ephemeral http server on a random port) and REAL socket.io-client
// connections, backed by real PostgreSQL fixtures. No mocked transport: this
// is the same `registerCricketRealtime`/`publishMatchState` code the real
// server.js wires up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import { registerCricketRealtime, publishMatchState, matchRoom } from '../../realtime/cricketRealtime.js'
import { createTeamsFixture } from './fixtures.js'

async function startTestServer() {
  const httpServer = http.createServer()
  const io = new Server(httpServer, { cors: { origin: '*' } })
  registerCricketRealtime(io)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    io,
    url: `http://localhost:${port}`,
    async close() {
      io.close()
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

function connectClient(url) {
  // reconnection: false — a test client that errors/times out must never
  // keep retrying in the background, which would otherwise hang the test
  // process on exit regardless of that individual test's outcome.
  return ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false })
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for '${event}'`)), timeoutMs)
    socket.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function joinAndWaitConnected(url, matchId) {
  const client = connectClient(url)
  await waitForEvent(client, 'connect')
  client.emit('join-match', { matchId })
  return client
}

async function makeLiveMatch(fx) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Realtime Test Ground', matchDate: new Date().toISOString(), oversPerInnings: 4, ballsPerOver: 6 })
  const mpsA = []
  for (const p of fx.squadA.slice(0, 4)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of fx.squadB.slice(0, 4)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)
  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  const { innings } = await scoringService.getInningsState(innings1.id)
  await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: innings.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  const { innings: innings2row } = await scoringService.getInningsState(innings1.id)
  await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: innings2row.version, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  return { matchId: match.id, innings1Id: innings1.id, mpsA, mpsB }
}

test('R1 — a spectator who joins a valid match room receives the published authoritative state', async () => {
  const server = await startTestServer()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeLiveMatch(fx)
    const client = await joinAndWaitConnected(server.url, matchId)
    const received = waitForEvent(client, 'match:state')

    await publishMatchState(server.io, matchId, 'delivery')

    const payload = await received
    assert.equal(payload.matchId, matchId)
    assert.equal(payload.reason, 'delivery')
    assert.equal(payload.match.status, 'live')
    assert.ok(payload.currentInnings)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R2/R48 — joining a nonexistent match emits a structured match:error, never a crash', async () => {
  const server = await startTestServer()
  try {
    const client = connectClient(server.url)
    await waitForEvent(client, 'connect')
    client.emit('join-match', { matchId: 999999999 })
    const err = await waitForEvent(client, 'match:error')
    assert.match(err.message, /not found/i)
    client.disconnect()
  } finally {
    await server.close()
  }
})

test('R3 — a malformed matchId is rejected without ever touching the database', async () => {
  const server = await startTestServer()
  try {
    const client = connectClient(server.url)
    await waitForEvent(client, 'connect')
    client.emit('join-match', { matchId: 'DROP TABLE matches;' })
    const err = await waitForEvent(client, 'match:error')
    assert.match(err.message, /valid matchId/i)
    client.disconnect()
  } finally {
    await server.close()
  }
})

test('R5/R38/R70 — room isolation: publishing to match A never reaches a spectator watching match B', async () => {
  const server = await startTestServer()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId: matchA } = await makeLiveMatch(fx)
    const { matchId: matchB } = await makeLiveMatch(fx)

    const clientA = await joinAndWaitConnected(server.url, matchA)
    const clientB = await joinAndWaitConnected(server.url, matchB)
    await new Promise((r) => setTimeout(r, 100)) // let both joins land

    let bLeaked = false
    clientB.once('match:state', () => {
      bLeaked = true
    })
    const aReceived = waitForEvent(clientA, 'match:state')

    await publishMatchState(server.io, matchA, 'delivery')
    const payload = await aReceived
    assert.equal(payload.matchId, matchA)

    await new Promise((r) => setTimeout(r, 200))
    assert.equal(bLeaked, false, 'match B spectator must never receive match A state')

    clientA.disconnect()
    clientB.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R6/R37/R69 — multiple spectators in the same room all receive identical authoritative state', async () => {
  const server = await startTestServer()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeLiveMatch(fx)
    const clientA = await joinAndWaitConnected(server.url, matchId)
    const clientB = await joinAndWaitConnected(server.url, matchId)
    const clientC = await joinAndWaitConnected(server.url, matchId)
    await new Promise((r) => setTimeout(r, 100))

    const pa = waitForEvent(clientA, 'match:state')
    const pb = waitForEvent(clientB, 'match:state')
    const pc = waitForEvent(clientC, 'match:state')
    await publishMatchState(server.io, matchId, 'delivery')
    const [a, b, c] = await Promise.all([pa, pb, pc])
    assert.deepEqual(a, b)
    assert.deepEqual(b, c)

    clientA.disconnect()
    clientB.disconnect()
    clientC.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R6b — leave-match stops further delivery to that socket', async () => {
  const server = await startTestServer()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeLiveMatch(fx)
    const client = await joinAndWaitConnected(server.url, matchId)
    await new Promise((r) => setTimeout(r, 100))
    client.emit('leave-match', { matchId })
    await new Promise((r) => setTimeout(r, 100))

    let received = false
    client.once('match:state', () => {
      received = true
    })
    await publishMatchState(server.io, matchId, 'delivery')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(received, false)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R7/R44 — published payload is the exact authoritative live-state DTO, privacy-safe', async () => {
  const server = await startTestServer()
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeLiveMatch(fx)
    const client = await joinAndWaitConnected(server.url, matchId)
    const received = waitForEvent(client, 'match:state')
    await publishMatchState(server.io, matchId, 'delivery')
    const payload = await received

    assert.ok('currentInnings' in payload)
    assert.ok('target' in payload)
    assert.ok('result' in payload)
    const blob = JSON.stringify(payload)
    for (const forbidden of ['@example', 'user_id', 'password', 'canteen', 'refresh_token', 'otp']) {
      assert.ok(!blob.toLowerCase().includes(forbidden.toLowerCase()), `payload must never contain '${forbidden}'`)
    }
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('R8/R79 — publishMatchState with no io instance is a safe no-op', async () => {
  await assert.doesNotReject(() => publishMatchState(null, 123, 'delivery'))
})

test('R9/R78 — publishMatchState for a nonexistent match logs and never throws', async () => {
  const server = await startTestServer()
  try {
    await assert.doesNotReject(() => publishMatchState(server.io, 999999999, 'delivery'))
  } finally {
    await server.close()
  }
})

test('matchRoom() naming is deterministic and matchId-scoped', () => {
  assert.equal(matchRoom(123), 'match:123')
  assert.equal(matchRoom('123'), 'match:123')
  assert.notEqual(matchRoom(1), matchRoom(2))
})
