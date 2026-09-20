// Phase 8 — real end-to-end coverage for matchChatRealtime.js's socket
// authentication, which had ZERO test coverage before this phase (confirmed
// via repo-wide grep) despite being a real, previously-broken production
// path: it authenticated ONLY via a JWT sent in the join payload, and no
// real user has had a JWT to send since Phase 3 replaced password login
// with OTP — match chat was unreachable for every real user. Fixed to
// authenticate via the same HttpOnly session cookie every REST route uses,
// with the JWT kept only as a fallback. This file proves the fix against a
// REAL Socket.IO server + REAL socket.io-client connections + REAL Postgres
// fixtures, same pattern as cricketRealtime.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { registerMatchChatRealtime, publishMatchMessage, matchChatRoom } from '../../realtime/matchChatRealtime.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestServer() {
  const httpServer = http.createServer()
  const io = new Server(httpServer, { cors: { origin: '*', credentials: true } })
  registerMatchChatRealtime(io)
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

// Node's `ws`-based websocket transport does not forward `extraHeaders` into
// the handshake (confirmed by direct probe) — a real browser doesn't have
// this limitation, since it attaches cookies from its own cookie jar to
// both the polling XHR and the WebSocket upgrade automatically once
// `withCredentials: true` is set (matchChatRealtime.js's fix relies on that
// standard browser behavior, not on this test client's `extraHeaders`
// workaround). Include 'polling' so this Node test client can actually
// deliver the cookie header, exercising the real server-side parsing logic.
function connectClient(url, { cookie, extraHeaders } = {}) {
  return ioClient(url, {
    transports: ['polling', 'websocket'],
    forceNew: true,
    reconnection: false,
    withCredentials: true,
    extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
  })
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

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash',$3) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-mcr-${label}-${uniqueTag()}@example.test`, role],
  )
  const user = rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function setupMatchWithParticipants() {
  const tag = uniqueTag()
  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `integration-test-mcr-ground-${tag}`,
      `Integration Test MCR Ground ${tag}`,
    ])
  ).rows[0]
  const owner = await createUser(`owner-${tag}`)
  const outsider = await createUser(`outsider-${tag}`)
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'MCA') RETURNING *`, [`MCR Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'MCB') RETURNING *`, [`MCR Team B ${tag}`])).rows[0]
  await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  const match = await matchService.createMatch({
    teamAId: teamA.id,
    teamBId: teamB.id,
    matchDate: new Date(Date.now() + 86400000).toISOString(),
    groundId: ground.id,
    requiredUmpires: 1,
  })
  return {
    ground,
    owner,
    outsider,
    match,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
      await owner.cleanup()
      await outsider.cleanup()
    },
  }
}

test('a participant with a real session cookie can join match chat and receive a published message', async () => {
  const server = await startTestServer()
  const fx = await setupMatchWithParticipants()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.owner.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-match-chat', { matchId: fx.match.id })
    const received = waitForEvent(client, 'match:message')
    await new Promise((r) => setTimeout(r, 150)) // let the join land before publishing

    publishMatchMessage(server.io, fx.match.id, { id: 1, matchId: fx.match.id, body: 'hello' })
    const payload = await received
    assert.equal(payload.matchId, fx.match.id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('joining with no session cookie and no legacy JWT is rejected with a clean match:error, never a crash', async () => {
  const server = await startTestServer()
  const fx = await setupMatchWithParticipants()
  try {
    const client = connectClient(server.url)
    await waitForEvent(client, 'connect')
    client.emit('join-match-chat', { matchId: fx.match.id })
    const err = await waitForEvent(client, 'match:error')
    assert.match(err.message, /authentication required/i)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('an authenticated user who is not a match participant is rejected from that match\'s chat', async () => {
  const server = await startTestServer()
  const fx = await setupMatchWithParticipants()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.outsider.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-match-chat', { matchId: fx.match.id })
    const err = await waitForEvent(client, 'match:error')
    assert.match(err.message, /not a participant/i)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

// Phase 8 — the legacy JWT fallback is kept (mirrors requireAuth's own
// dual-path design), even though no real client can present one anymore.
// This proves the fallback still works, not that it's reachable in
// production — the join payload is the only way to exercise it now.
test('legacy JWT fallback (no session cookie) still authenticates — proves the fallback path was not silently broken', async () => {
  const server = await startTestServer()
  const fx = await setupMatchWithParticipants()
  try {
    const client = connectClient(server.url)
    await waitForEvent(client, 'connect')
    client.emit('join-match-chat', { matchId: fx.match.id, token: fx.owner.token })
    const received = waitForEvent(client, 'match:message')
    await new Promise((r) => setTimeout(r, 150))

    publishMatchMessage(server.io, fx.match.id, { id: 2, matchId: fx.match.id, body: 'legacy path' })
    const payload = await received
    assert.equal(payload.matchId, fx.match.id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('matchChatRoom() naming is deterministic and matchId-scoped, distinct from the public spectator room', () => {
  assert.equal(matchChatRoom(123), 'match-chat:123')
  assert.notEqual(matchChatRoom(123), 'match:123')
})
