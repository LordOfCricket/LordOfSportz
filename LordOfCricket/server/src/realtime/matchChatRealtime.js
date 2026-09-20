// Umpire Communication & Commercial 2.0 — match-scoped chat realtime.
// Mirrors cricketRealtime.js's additive registration pattern (a separate
// `register*Realtime(io)` module, one more io.on('connection', ...)
// listener, never a second Socket.IO server) but adds something
// cricketRealtime.js's spectator room deliberately doesn't have: a real
// participant-authorization check before joining. The public `match:${id}`
// spectator room is left untouched — this uses its own `match-chat:${id}`
// room so a private chat message can never leak into the public spectator
// broadcast.
import { authenticateSocketUser } from './socketAuth.js'
import { resolveSenderRole } from '../services/matchAccess.service.js'
import { isSuperAdminUser } from '../middlewares/auth.js'
import { logger } from '../utils/logger.js'

export function matchChatRoom(matchId) {
  return `match-chat:${matchId}`
}

// No existing socket handler in this codebase authenticates the caller
// (confirmed by audit — join-match/join-order-room trust the payload
// alone). Chat is participant-only, so this is the first join handler that
// must verify a real identity.
//
// Phase 8 — this used to authenticate ONLY via a JWT the client sent in the
// join payload (`payload.token`, read from localStorage). A full legacy-JWT
// dependency audit found that no real user has had a JWT to send since
// Phase 3 replaced password login with OTP (nothing writes to localStorage's
// authToken key anymore) — meaning match chat has been completely
// unreachable for every real user since that deploy, a genuine production
// bug hiding behind "this looks like intentional auth," not a cosmetic gap.
// Fixed to authenticate via the same HttpOnly session cookie every REST
// route uses (requireAuth's primary path) — Socket.IO's handshake carries
// the browser's cookies once the client connects with
// `withCredentials: true` and the server's socket.io CORS allows
// credentials (server.js). The JWT branch is kept only as a fallback (same
// reasoning as requireAuth's own dual-path design) — harmless since no real
// client can present one, and matches the rest of the codebase's posture
// rather than deleting a working fallback path.
// This task (canteen realtime auth) needed the exact same cookie/JWT-
// fallback resolution a second time — extracted to realtime/socketAuth.js
// rather than growing a second copy here. Behavior is unchanged.
export function registerMatchChatRealtime(io) {
  io.on('connection', (socket) => {
    socket.on('join-match-chat', async (payload) => {
      const matchId = Number(payload?.matchId)
      if (!Number.isInteger(matchId) || matchId <= 0) {
        socket.emit('match:error', { message: 'A valid matchId is required to join match chat.' })
        return
      }
      try {
        const user = await authenticateSocketUser(socket, payload?.token)
        if (!user) {
          socket.emit('match:error', { message: 'Authentication required to join match chat.' })
          return
        }
        if (!isSuperAdminUser(user)) {
          const resolved = await resolveSenderRole(matchId, user)
          if (!resolved) {
            socket.emit('match:error', { message: 'You are not a participant in this match.' })
            return
          }
        }
        socket.join(matchChatRoom(matchId))
      } catch (err) {
        logger.error('join-match-chat failed', { matchId, error: err.message })
        socket.emit('match:error', { message: 'Could not join match chat.' })
      }
    })

    socket.on('leave-match-chat', (payload) => {
      const matchId = Number(payload?.matchId)
      if (Number.isInteger(matchId) && matchId > 0) socket.leave(matchChatRoom(matchId))
    })
  })
}

// Same fire-and-forget/best-effort contract as publishMatchState/
// publishCommentary — a broadcast failure must never surface as a message-
// send failure; the DB insert already committed, delivery is best-effort.
export function publishMatchMessage(io, matchId, message) {
  if (!io || matchId == null) return
  try {
    io.to(matchChatRoom(matchId)).emit('match:message', message)
  } catch (err) {
    logger.error('Match message publish failed', { matchId, error: err.message })
  }
}
