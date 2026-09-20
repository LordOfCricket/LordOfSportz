// Real end-to-end coverage for canteenRealtime.js's socket authentication —
// previously ZERO auth on join-staff-room/join-user-room/join-order-room
// (confirmed by audit, same class of gap matchChatRealtime.integration.test.js
// already covers for match chat): any connected client could join another
// user's private order room, or the staff broadcast room, just by knowing/
// guessing an id. This file proves the fix against a REAL Socket.IO server +
// REAL socket.io-client connections + REAL Postgres fixtures, same pattern
// as matchChatRealtime.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { registerCanteenRealtime } from '../../realtime/canteenRealtime.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestServer() {
  const httpServer = http.createServer()
  const io = new Server(httpServer, { cors: { origin: '*', credentials: true } })
  registerCanteenRealtime(io)
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

// Same 'polling' + extraHeaders workaround as matchChatRealtime's test —
// Node's `ws`-based transport doesn't forward extraHeaders into the
// handshake, a real browser doesn't have this limitation (matchChatRealtime.
// js's fix relies on the browser's own cookie jar via withCredentials).
function connectClient(url, { cookie, token } = {}) {
  return ioClient(url, {
    transports: ['polling', 'websocket'],
    forceNew: true,
    reconnection: false,
    withCredentials: true,
    extraHeaders: cookie ? { Cookie: cookie } : {},
    auth: token ? { token } : {},
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

// A short pause after a join emit — same convention matchChatRealtime's
// test uses to let an async join handler land before asserting room state.
const settle = () => new Promise((r) => setTimeout(r, 150))

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash',$3) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-cr-${label}-${uniqueTag()}@example.test`, role],
  )
  const user = rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function setupCanteenWithOrder() {
  const tag = uniqueTag()
  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `integration-test-cr-ground-${tag}`,
      `Integration Test CR Ground ${tag}`,
    ])
  ).rows[0]
  const canteen = (
    await pool.query(`INSERT INTO canteens (ground_id, public_canteen_id, name) VALUES ($1,$2,$3) RETURNING *`, [
      ground.id,
      generatePublicId('CAN', 8),
      `Integration Test CR Canteen ${tag}`,
    ])
  ).rows[0]
  const owner = await createUser(`owner-${tag}`)
  const outsider = await createUser(`outsider-${tag}`)
  const staff = await createUser(`staff-${tag}`, { role: 'staff' })
  const publicOrderId = generatePublicId('ORD', 8)
  const order = (
    await pool.query(
      `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status)
       VALUES ($1,$2,$3,'Integration Test Customer','A1',100,'Pending') RETURNING *`,
      [publicOrderId, owner.id, canteen.id],
    )
  ).rows[0]
  return {
    ground,
    canteen,
    owner,
    outsider,
    staff,
    order,
    async cleanup() {
      await pool.query('DELETE FROM orders WHERE id = $1', [order.id])
      await pool.query('DELETE FROM canteens WHERE id = $1', [canteen.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
      await owner.cleanup()
      await outsider.cleanup()
      await staff.cleanup()
    },
  }
}

test('an unauthenticated socket can still connect (no regression for public match/booking rooms)', async () => {
  const server = await startTestServer()
  try {
    const client = connectClient(server.url)
    const connected = await waitForEvent(client, 'connect')
    assert.equal(connected, undefined) // 'connect' carries no payload — just proves the handshake succeeded with zero credential
    client.disconnect()
  } finally {
    await server.close()
  }
})

test('join-staff-room: an unauthenticated socket is rejected and never receives staff broadcasts', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const client = connectClient(server.url)
    await waitForEvent(client, 'connect')
    client.emit('join-staff-room')
    const err = await waitForEvent(client, 'canteen:error')
    assert.match(err.message, /staff access required/i)

    let leaked = false
    client.on('order-created', () => { leaked = true })
    server.io.to('staff').emit('order-created', { id: fx.order.public_order_id })
    await settle()
    assert.equal(leaked, false)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-staff-room: a staff-authenticated socket joins and receives staff broadcasts', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.staff.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-staff-room')
    const received = waitForEvent(client, 'order-created')
    await settle()

    server.io.to('staff').emit('order-created', { id: fx.order.public_order_id })
    const payload = await received
    assert.equal(payload.id, fx.order.public_order_id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-user-room: a wrong-user socket cannot join someone else\'s user room and never receives their order events', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.outsider.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-user-room', fx.owner.id)
    const err = await waitForEvent(client, 'canteen:error')
    assert.match(err.message, /your own user room/i)

    let leaked = false
    client.on('order-status-updated', () => { leaked = true })
    server.io.to(`user:${fx.owner.id}`).emit('order-status-updated', { id: fx.order.public_order_id, status: 'Accepted' })
    await settle()
    assert.equal(leaked, false)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-user-room: the real owner can join their own user room and receives their order events', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.owner.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-user-room', fx.owner.id)
    const received = waitForEvent(client, 'order-status-updated')
    await settle()

    server.io.to(`user:${fx.owner.id}`).emit('order-status-updated', { id: fx.order.public_order_id, status: 'Accepted' })
    const payload = await received
    assert.equal(payload.id, fx.order.public_order_id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-order-room: an unauthenticated or wrong-user socket cannot join another user\'s order room', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    // No credential at all.
    const anon = connectClient(server.url)
    await waitForEvent(anon, 'connect')
    anon.emit('join-order-room', fx.order.public_order_id)
    const anonErr = await waitForEvent(anon, 'canteen:error')
    assert.match(anonErr.message, /authentication required/i)
    anon.disconnect()

    // Authenticated, but not this order's owner.
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.outsider.id)
    const outsider = connectClient(server.url, { cookie })
    await waitForEvent(outsider, 'connect')
    outsider.emit('join-order-room', fx.order.public_order_id)
    const outsiderErr = await waitForEvent(outsider, 'canteen:error')
    assert.match(outsiderErr.message, /your own order room/i)

    let leaked = false
    outsider.on('order-completed', () => { leaked = true })
    server.io.to(`order:${fx.order.public_order_id}`).emit('order-completed', { id: fx.order.public_order_id })
    await settle()
    assert.equal(leaked, false)
    outsider.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-order-room: the real owner can join their own order room and receives its events', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.owner.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-order-room', fx.order.public_order_id)
    const received = waitForEvent(client, 'order-completed')
    await settle()

    server.io.to(`order:${fx.order.public_order_id}`).emit('order-completed', { id: fx.order.public_order_id })
    const payload = await received
    assert.equal(payload.id, fx.order.public_order_id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

test('join-order-room: staff can join any order room regardless of ownership', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const { cookie } = await mintMfaVerifiedSessionCookie(fx.staff.id)
    const client = connectClient(server.url, { cookie })
    await waitForEvent(client, 'connect')
    client.emit('join-order-room', fx.order.public_order_id)
    const received = waitForEvent(client, 'order-completed')
    await settle()

    server.io.to(`order:${fx.order.public_order_id}`).emit('order-completed', { id: fx.order.public_order_id })
    const payload = await received
    assert.equal(payload.id, fx.order.public_order_id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})

// Phase 8's dependency audit found no real user has had a JWT to send since
// password login was replaced by OTP — this proves the fallback path itself
// was not silently broken by this task's changes, not that it's reachable
// in production (mirrors matchChatRealtime.integration.test.js's identical
// legacy-fallback test and its comment).
test('legacy JWT fallback (handshake.auth.token, no session cookie) still authenticates a staff join', async () => {
  const server = await startTestServer()
  const fx = await setupCanteenWithOrder()
  try {
    const client = connectClient(server.url, { token: fx.staff.token })
    await waitForEvent(client, 'connect')
    client.emit('join-staff-room')
    const received = waitForEvent(client, 'order-created')
    await settle()

    server.io.to('staff').emit('order-created', { id: fx.order.public_order_id })
    const payload = await received
    assert.equal(payload.id, fx.order.public_order_id)
    client.disconnect()
  } finally {
    await fx.cleanup()
    await server.close()
  }
})
