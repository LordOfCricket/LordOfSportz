import { isSuperAdminUser } from '../middlewares/auth.js'
import { findMatchById } from '../models/match.model.js'
import { findSlotsByMatch } from '../models/matchUmpireSlot.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'

// Umpire Communication & Commercial 2.0 — the shared "who is authorized to
// act on this match" resolver for match-scoped communication, reused by
// both the REST message endpoints and the socket join handler (one check,
// two call sites, never two separate implementations). Deliberately a
// service (not domain/, which this codebase reserves for zero-I/O pure
// functions — see domain/umpireReputation/badges.js) since resolving
// participants inherently means DB reads.

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function forbidden(message) {
  const err = new Error(message)
  err.statusCode = 403
  return err
}

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

// Ground Owner(s) of the match's ground + umpire(s) currently/historically
// holding a slot (ASSIGNED/COMPLETED — same "held" definition Operations
// 2.0 already established for officiating credit via hasHeldSlotAssignment/
// getUmpireStats, reused here rather than re-derived). No separate "scorer"
// population exists (confirmed by audit — ground_users.role='SCORER' is a
// dead enum value, never granted anywhere).
export async function resolveMatchParticipants(matchId) {
  const match = await findMatchById(matchId)
  if (!match) return null
  const [ownerUserIds, slots] = await Promise.all([findActiveGroundOwnerUserIds(match.ground_id), findSlotsByMatch(matchId)])
  const umpireUserIds = [...new Set(slots.filter((s) => (s.status === 'ASSIGNED' || s.status === 'COMPLETED') && s.umpire_user_id).map((s) => s.umpire_user_id))]
  return {
    match,
    ownerUserIds,
    umpireUserIds,
  }
}

// Resolves the ROLE a specific user would send a message as — only a real
// Ground Owner or a real assigned/held umpire may send (never a
// super-admin-only bypass mapped onto a fake role: sender_role's CHECK
// constraint only accepts 'GROUND_OWNER'/'UMPIRE', and misattributing a
// staff-initiated message to either would be dishonest). Returns null if
// the user is not a genuine participant.
export async function resolveSenderRole(matchId, user) {
  const participants = await resolveMatchParticipants(matchId)
  if (!participants) throw notFound('Match not found.')
  if (participants.ownerUserIds.includes(user.id)) return { participants, role: 'GROUND_OWNER' }
  if (participants.umpireUserIds.includes(user.id)) return { participants, role: 'UMPIRE' }
  return null
}

// Read-access gate: a genuine participant, OR super admin (same bypass
// posture as requireGroundRole/requireMatchScorer elsewhere in this
// codebase — satisfies "Admin can access administrative commercial/
// communication data" for free, no separate admin route needed).
export async function authorizeMatchRead(matchId, user) {
  const participants = await resolveMatchParticipants(matchId)
  if (!participants) throw notFound('Match not found.')
  if (isSuperAdminUser(user)) return participants
  if (participants.ownerUserIds.includes(user.id) || participants.umpireUserIds.includes(user.id)) return participants
  throw forbidden('You are not a participant in this match.')
}

export { forbidden, notFound, badRequest }
