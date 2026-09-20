// Canteen realtime — staff/user/order rooms. Extracted from server.js's
// original inline io.on('connection', ...) block (the very first Socket.IO
// handlers this app had, predating the register*Realtime(io) convention
// cricketRealtime.js/bookingRealtime.js/matchChatRealtime.js established
// later) so this task's security fix could be covered by the same real
// Socket.IO integration test pattern every other realtime module already
// uses — see tests/integration/canteenRealtime.integration.test.js. No
// behavior change from the extraction itself.
import { authenticateSocketUser } from './socketAuth.js'
import { findOrderByPublicId } from '../models/canteenOrder.model.js'
import { logger } from '../utils/logger.js'

// Security fix — these three handlers previously trusted whatever the
// client claimed (a role, a userId, an orderId) with zero verification, the
// one place in the app where the REST layer's ownership checks (see
// getActiveOrder/getOrderHistory's `req.user.id !== userId && req.user.role
// !== 'staff'` → 403 in canteenOrder.controller.js) had no Socket.IO
// equivalent: any connected client could `join-user-room` with someone
// else's id and silently receive their private order events, or
// `join-staff-room` and receive every staff broadcast.
//
// Resolved via realtime/socketAuth.js's authenticateSocketUser — the same
// HttpOnly-session-cookie-primary/legacy-JWT-fallback resolution
// matchChatRealtime.js already established for this exact class of problem
// (see that file's own header comment on why a client-supplied JWT alone
// was a dead path for every real user since Phase 3's OTP migration).
// Resolved ONCE per connection (not per-event, unlike join-match-chat) since
// none of these three events carry a payload object to read a fallback
// token from — join-staff-room/join-user-room/join-order-room keep their
// existing primitive payloads unchanged, so the JWT fallback is read once
// from the standard `socket.handshake.auth.token` Socket.IO client
// convention instead.
//
// Deliberately NOT an io.use(...) connection-level gate: an unresolved
// socket.user must not block the connection itself — match/booking rooms
// are intentionally public (cricketRealtime.js/bookingRealtime.js,
// untouched) and must keep working with no credential at all.
export function registerCanteenRealtime(io) {
  io.on('connection', (socket) => {
    logger.info('Socket connected', { socketId: socket.id })

    // Started immediately but NOT awaited here — the handshake's http
    // upgrade round-trip already gives socket.io-client's first emit a
    // moment to reach the server, but there's no guarantee it loses that
    // race against a DB lookup. Registering every socket.on(...) handler
    // below SYNCHRONOUSLY (this callback itself is not async) means an
    // event fired the instant 'connect' resolves is never dropped for want
    // of a listener; each handler individually awaits this shared promise
    // (resolved once, cached) before checking socket.user.
    const userPromise = authenticateSocketUser(socket, socket.handshake.auth?.token)

    socket.on('join-staff-room', async () => {
      const user = await userPromise
      if (user?.role !== 'staff') {
        socket.emit('canteen:error', { message: 'Staff access required to join the staff room.' })
        return
      }
      socket.join('staff')
    })

    socket.on('join-user-room', async (userId) => {
      const user = await userPromise
      if (!userId || !user || user.id !== Number(userId)) {
        socket.emit('canteen:error', { message: 'You can only join your own user room.' })
        return
      }
      socket.join(`user:${userId}`)
    })

    // Mirrors emitToOrderRooms' own room set (staff + user:{userId}) — a
    // client already needs to pass ONE of those two checks to ever receive
    // anything useful from this room, but the room join itself was the
    // actual gap (see this task's brief): joining order:{id} bypassed both,
    // so a socket could listen for one specific order without matching
    // either condition. findOrderByPublicId is the same row-fetch
    // canteenOrder.model.js#findOrderById already uses for the REST GET /:id
    // route, just without that route's canteen_id filter (see its own
    // comment — orderId is a table-wide unique column, no canteen context
    // exists at the socket layer to filter by anyway).
    socket.on('join-order-room', async (orderId) => {
      const user = await userPromise
      if (!orderId || !user) {
        socket.emit('canteen:error', { message: 'Authentication required to join an order room.' })
        return
      }
      if (user.role === 'staff') {
        socket.join(`order:${orderId}`)
        return
      }
      try {
        const order = await findOrderByPublicId(orderId)
        if (!order || order.user_id !== user.id) {
          socket.emit('canteen:error', { message: 'You can only join your own order room.' })
          return
        }
        socket.join(`order:${orderId}`)
      } catch (err) {
        logger.error('join-order-room failed', { orderId, error: err.message })
        socket.emit('canteen:error', { message: 'Could not join order room.' })
      }
    })

    socket.on('disconnect', () => logger.info('Socket disconnected', { socketId: socket.id }))
  })
}
