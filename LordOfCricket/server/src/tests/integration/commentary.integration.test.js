// Phase 12 — integration tests for the commentary projection: real
// PostgreSQL persistence, the real public HTTP API, and (mirroring Phase
// 11's cricketRealtimePublish.integration.test.js pattern exactly) the real
// Socket.IO match:commentary broadcast over a real app + real spectator.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import app from '../../app.js'
import { registerCricketRealtime } from '../../realtime/cricketRealtime.js'
import { signToken } from '../../utils/jwt.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import * as commentaryService from '../../services/commentary.service.js'
import { createFixture, createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  const io = new Server(httpServer, { cors: { origin: '*' } })
  app.locals.io = io
  registerCricketRealtime(io)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
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

function waitForCommentary(client, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for match:commentary')), timeoutMs)
    client.once('match:commentary', (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

test('a real HTTP delivery persists commentary retrievable via the public API', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const token = signToken({ id: fx.userId })
    const { innings } = await scoringService.getInningsState(fx.inningsId)
    const { status } = await json(`${server.baseUrl}/innings/${fx.inningsId}/deliveries`, {
      method: 'POST',
      token,
      body: { expectedVersion: innings.version, clientActionId: randomUUID(), batRuns: 4, bowlerMatchPlayerId: fx.bowler1 },
    })
    assert.equal(status, 201)

    // The append happens fire-and-forget after res.json — give it a beat.
    await new Promise((r) => setTimeout(r, 300))

    const { status: getStatus, data } = await json(`${server.baseUrl}/matches/${fx.matchId}/commentary`)
    assert.equal(getStatus, 200)
    assert.equal(data.inningsId, fx.inningsId)
    assert.ok(data.entries.length >= 1)
    const four = data.entries.find((e) => e.type === 'DELIVERY')
    assert.ok(four)
    assert.match(four.text, /FOUR/)
    assert.equal(four.score.runs, 4)
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('idempotent retry (same clientActionId) does not duplicate commentary rows', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const token = signToken({ id: fx.userId })
    const { innings } = await scoringService.getInningsState(fx.inningsId)
    const clientActionId = randomUUID()
    const body = { expectedVersion: innings.version, clientActionId, batRuns: 1, bowlerMatchPlayerId: fx.bowler1 }

    const first = await json(`${server.baseUrl}/innings/${fx.inningsId}/deliveries`, { method: 'POST', token, body })
    assert.equal(first.status, 201)
    await new Promise((r) => setTimeout(r, 300))

    const second = await json(`${server.baseUrl}/innings/${fx.inningsId}/deliveries`, { method: 'POST', token, body })
    assert.equal(second.status, 201)
    assert.equal(second.data.idempotentReplay, true)
    await new Promise((r) => setTimeout(r, 300))

    const { data } = await json(`${server.baseUrl}/matches/${fx.matchId}/commentary`)
    const deliveryEntries = data.entries.filter((e) => e.type === 'DELIVERY')
    assert.equal(deliveryEntries.length, 1, 'a retried clientActionId must not produce a second commentary row')
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('a historical correction regenerates the affected commentary entry in place (no duplicate row)', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const { innings: i0 } = await scoringService.getInningsState(fx.inningsId)
    const { delivery } = await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: i0.version, clientActionId: randomUUID(), input: { wicket: { type: 'bowled' }, bowlerMatchPlayerId: fx.bowler1 } })
    await commentaryService.appendCommentaryForInnings(fx.inningsId)

    const before = await commentaryService.getCommentaryPage({ matchId: fx.matchId })
    const beforeWicket = before.entries.find((e) => e.type === 'WICKET')
    assert.match(beforeWicket.text, /bowled by/)

    const token = signToken({ id: fx.userId })
    const { innings: i1 } = await scoringService.getInningsState(fx.inningsId)
    const { status } = await json(`${server.baseUrl}/innings/${fx.inningsId}/corrections`, {
      method: 'POST',
      token,
      body: { targetType: 'delivery', targetId: delivery.id, patch: { wicket: { type: 'caught', fielderMatchPlayerId: fx.bowler2 } }, reasonCode: 'WRONG_WICKET', expectedVersion: i1.version, clientActionId: randomUUID() },
    })
    assert.equal(status, 201)
    await new Promise((r) => setTimeout(r, 300))

    const { data } = await json(`${server.baseUrl}/matches/${fx.matchId}/commentary`)
    const wicketEntries = data.entries.filter((e) => e.type === 'WICKET')
    assert.equal(wicketEntries.length, 1, 'a correction must regenerate the SAME entry, never add a second one')
    assert.match(wicketEntries[0].text, /is caught by/)
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('realtime: a spectator receives match:commentary (mode=append) after a delivery, without reload', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const spectator = await connectSpectator(server.socketUrl, fx.matchId)
    await new Promise((r) => setTimeout(r, 100))
    const nextCommentary = waitForCommentary(spectator)

    const token = signToken({ id: fx.userId })
    const { innings } = await scoringService.getInningsState(fx.inningsId)
    const { status } = await json(`${server.baseUrl}/innings/${fx.inningsId}/deliveries`, {
      method: 'POST',
      token,
      body: { expectedVersion: innings.version, clientActionId: randomUUID(), batRuns: 6, bowlerMatchPlayerId: fx.bowler1 },
    })
    assert.equal(status, 201)

    const payload = await nextCommentary
    assert.equal(payload.mode, 'append')
    assert.equal(payload.matchId, fx.matchId)
    assert.equal(payload.inningsId, fx.inningsId)
    assert.ok(payload.entries.length >= 1)
    assert.match(payload.entries[0].text, /SIX/)

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('realtime: a correction publishes match:commentary (mode=resync), and the spectator refetch shows the corrected text', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const { innings: i0 } = await scoringService.getInningsState(fx.inningsId)
    const { delivery } = await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: i0.version, clientActionId: randomUUID(), input: { batRuns: 2, bowlerMatchPlayerId: fx.bowler1 } })
    await commentaryService.appendCommentaryForInnings(fx.inningsId)

    const spectator = await connectSpectator(server.socketUrl, fx.matchId)
    await new Promise((r) => setTimeout(r, 100))
    const nextCommentary = waitForCommentary(spectator)

    const token = signToken({ id: fx.userId })
    const { innings: i1 } = await scoringService.getInningsState(fx.inningsId)
    await json(`${server.baseUrl}/innings/${fx.inningsId}/corrections`, {
      method: 'POST',
      token,
      body: { targetType: 'delivery', targetId: delivery.id, patch: { batRuns: 6 }, reasonCode: 'WRONG_RUNS', expectedVersion: i1.version, clientActionId: randomUUID() },
    })

    const payload = await nextCommentary
    assert.equal(payload.mode, 'resync')
    assert.deepEqual(payload.entries, [], 'a resync tells the client to refetch, it does not try to describe what changed')

    const { data } = await json(`${server.baseUrl}/matches/${fx.matchId}/commentary`)
    const deliveryEntry = data.entries.find((e) => e.type === 'DELIVERY')
    assert.match(deliveryEntry.text, /SIX/, 'HTTP refetch after resync must show the corrected commentary')

    spectator.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('room isolation: match A commentary never reaches a spectator watching match B', async () => {
  const server = await startTestApp()
  const fxA = await createFixture()
  const fxB = await createFixture()
  try {
    await fxA.seatOpeners()
    await fxB.seatOpeners()
    const spectatorB = await connectSpectator(server.socketUrl, fxB.matchId)
    await new Promise((r) => setTimeout(r, 100))

    let leaked = false
    spectatorB.once('match:commentary', () => {
      leaked = true
    })

    const token = signToken({ id: fxA.userId })
    const { innings } = await scoringService.getInningsState(fxA.inningsId)
    await json(`${server.baseUrl}/innings/${fxA.inningsId}/deliveries`, {
      method: 'POST',
      token,
      body: { expectedVersion: innings.version, clientActionId: randomUUID(), batRuns: 4, bowlerMatchPlayerId: fxA.bowler1 },
    })
    await new Promise((r) => setTimeout(r, 400))

    assert.equal(leaked, false, "match A's commentary must never reach match B's room")
    spectatorB.disconnect()
  } finally {
    await fxA.cleanup()
    await fxB.cleanup()
    await server.close()
  }
})

test('multiple spectators on the same match receive byte-identical commentary', async () => {
  const server = await startTestApp()
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const s1 = await connectSpectator(server.socketUrl, fx.matchId)
    const s2 = await connectSpectator(server.socketUrl, fx.matchId)
    await new Promise((r) => setTimeout(r, 100))

    const p1 = waitForCommentary(s1)
    const p2 = waitForCommentary(s2)

    const token = signToken({ id: fx.userId })
    const { innings } = await scoringService.getInningsState(fx.inningsId)
    await json(`${server.baseUrl}/innings/${fx.inningsId}/deliveries`, {
      method: 'POST',
      token,
      body: { expectedVersion: innings.version, clientActionId: randomUUID(), batRuns: 1, bowlerMatchPlayerId: fx.bowler1 },
    })

    const [payload1, payload2] = await Promise.all([p1, p2])
    assert.deepEqual(payload1.entries, payload2.entries)

    s1.disconnect()
    s2.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('pagination: newest-first, bounded, with a stable before-cursor for older pages', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    for (let i = 0; i < 5; i++) {
      const { innings } = await scoringService.getInningsState(fx.inningsId)
      await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: innings.version, clientActionId: randomUUID(), input: { batRuns: i % 2, bowlerMatchPlayerId: fx.bowler1 } })
    }
    await commentaryService.rebuildInningsCommentary(fx.inningsId)

    const page1 = await commentaryService.getCommentaryPage({ matchId: fx.matchId, limit: 2 })
    assert.equal(page1.entries.length, 2)
    assert.ok(page1.pagination.hasMore)
    assert.ok(page1.entries[0].sequence > page1.entries[1].sequence, 'newest first')

    const page2 = await commentaryService.getCommentaryPage({ matchId: fx.matchId, limit: 2, before: page1.pagination.nextBefore })
    assert.ok(page2.entries.every((e) => e.sequence < page1.pagination.nextBefore))
    const seenSequences = new Set([...page1.entries, ...page2.entries].map((e) => e.sequence))
    assert.equal(seenSequences.size, 4, 'no overlap/duplication across pages')
  } finally {
    await fx.cleanup()
  }
})

test('a completed, finalized match has INNINGS_END/INNINGS_BREAK/MATCH_RESULT commentary for the right innings', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1, innings2 } = await playShortFinalizedMatch(fx)
    await commentaryService.rebuildInningsCommentary(innings1.id)
    await commentaryService.rebuildInningsCommentary(innings2.id)

    const inns1Page = await commentaryService.getCommentaryPage({ matchId, inningsId: innings1.id, limit: 100 })
    assert.ok(inns1Page.entries.some((e) => e.type === 'INNINGS_END'))
    assert.ok(inns1Page.entries.some((e) => e.type === 'INNINGS_BREAK'))
    assert.ok(inns1Page.entries.some((e) => e.type === 'WICKET' && /caught/.test(e.text)))

    const inns2Page = await commentaryService.getCommentaryPage({ matchId, inningsId: innings2.id, limit: 100 })
    assert.ok(inns2Page.entries.some((e) => e.type === 'MATCH_RESULT'))
    const result = inns2Page.entries.find((e) => e.type === 'MATCH_RESULT')
    assert.match(result.text, /won by/i)
  } finally {
    await fx.cleanup()
  }
})

test('backfill/rebuild is idempotent: running it twice produces the same entries, no duplicates', async () => {
  const fx = await createFixture()
  try {
    await fx.seatOpeners()
    const { innings } = await scoringService.getInningsState(fx.inningsId)
    await scoringService.recordDelivery({ inningsId: fx.inningsId, expectedVersion: innings.version, clientActionId: randomUUID(), input: { batRuns: 4, bowlerMatchPlayerId: fx.bowler1 } })

    const first = await commentaryService.rebuildInningsCommentary(fx.inningsId)
    const second = await commentaryService.rebuildInningsCommentary(fx.inningsId)
    assert.equal(first.entries.length, second.entries.length)
    assert.deepEqual(
      first.entries.map((e) => e.text),
      second.entries.map((e) => e.text)
    )
  } finally {
    await fx.cleanup()
  }
})
