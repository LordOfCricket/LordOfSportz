import { insertMessage, findMessagesForMatch } from '../models/matchMessage.model.js'
import { resolveSenderRole, authorizeMatchRead, forbidden, badRequest } from './matchAccess.service.js'
import { createNotification } from './groundNotification.service.js'
import { publishMatchMessage } from '../realtime/matchChatRealtime.js'

const MAX_BODY_LENGTH = 1000

function toDTO(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  }
}

// Workstream A/B/C — one unified send path for both announcements and chat
// (an announcement is just a message with no distinct type). Writes go
// through REST only (never a "send via socket" path): the DB insert is the
// authoritative write, then a best-effort notification fan-out and a
// best-effort realtime push follow — mirrors the scoring engine's own
// "HTTP writes, socket pushes" convention (cricketRealtime.js).
export async function sendMessage(matchId, user, body, io) {
  const trimmed = typeof body === 'string' ? body.trim() : ''
  if (!trimmed) throw badRequest('Message body is required.')
  if (trimmed.length > MAX_BODY_LENGTH) throw badRequest(`Message body must be ${MAX_BODY_LENGTH} characters or fewer.`)

  const resolved = await resolveSenderRole(matchId, user)
  if (!resolved) throw forbidden('You are not a participant in this match.')
  const { participants, role } = resolved

  const row = await insertMessage({ matchId, senderUserId: user.id, senderRole: role, body: trimmed })
  const message = toDTO({ ...row, sender_name: user.name })

  // Notify every OTHER participant — best-effort, never blocks message
  // delivery (Workstream E's own requirement; createNotification already
  // swallows its own failures, same posture as every other umpire-ops
  // notification in this codebase).
  // Phase 2 Cleanup — split by recipient so only the Ground-Owner-received
  // copy carries groundId (client-safe deep link into their own ground's
  // Matches tab, where MatchChatPanel lives — same TYPE_ROUTE_SUFFIX
  // convention as GROUND_BOOKING_*). The umpire-received copy of this same
  // `type` deliberately carries no groundId, exactly like every other
  // dual-audience type (UMPIRE_SLOT_ASSIGNED etc.) — NotificationBell's
  // UMPIRE_TYPE_ROUTE map is the umpire's own destination instead, gated on
  // umpire-mode so an owner viewing their own copy is never affected.
  const title = `New message from ${role === 'GROUND_OWNER' ? 'Ground Owner' : 'Umpire'}`
  const notifBody = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed
  await Promise.all([
    ...participants.ownerUserIds
      .filter((id) => id !== user.id)
      .map((userId) => createNotification({ userId, type: 'MATCH_MESSAGE', title, body: notifBody, relatedMatchId: matchId, groundId: participants.match.ground_id })),
    ...participants.umpireUserIds
      .filter((id) => id !== user.id)
      .map((userId) => createNotification({ userId, type: 'MATCH_MESSAGE', title, body: notifBody, relatedMatchId: matchId })),
  ])

  publishMatchMessage(io, matchId, message)
  return message
}

export async function listMessages(matchId, user) {
  await authorizeMatchRead(matchId, user)
  const rows = await findMessagesForMatch(matchId)
  return rows.map(toDTO)
}
