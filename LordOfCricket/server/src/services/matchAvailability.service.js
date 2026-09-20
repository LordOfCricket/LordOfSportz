import { findMatchById } from '../models/match.model.js'
import { findPlayerByUserId } from '../models/player.model.js'
import { upsertAvailability, findAvailability, listAvailabilityForMatch } from '../models/matchAvailability.model.js'

// Phase 14 Part 1 — RSVP business rules, extracted out of the controller so
// they're directly testable (same reasoning as Phase 13's
// teamRoster.service.js). A player's identity is ALWAYS resolved from their
// own userId, never accepted as an input parameter — that IS the entire
// authorization guarantee (Part 5: "a player must not be able to modify
// another player's availability"), not something layered on top afterward.

export const VALID_RSVP_STATUSES = ['AVAILABLE', 'NOT_AVAILABLE']

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

function conflict(message) {
  const err = new Error(message)
  err.statusCode = 409
  return err
}

function forbidden(message) {
  const err = new Error(message)
  err.statusCode = 403
  return err
}

function isEligible(player, match) {
  return Boolean(player) && (player.team_id === match.team_a_id || player.team_id === match.team_b_id)
}

export async function getMyAvailability(userId, matchId) {
  const match = await findMatchById(matchId)
  if (!match) throw notFound('Match not found.')

  const player = await findPlayerByUserId(userId)
  if (!isEligible(player, match)) return { eligible: false, status: null }

  const existing = await findAvailability(match.id, player.id)
  return { eligible: true, status: existing?.status || 'PENDING' }
}

export async function setMyAvailability(userId, matchId, status) {
  if (!VALID_RSVP_STATUSES.includes(status)) {
    const err = new Error(`status must be one of ${VALID_RSVP_STATUSES.join(', ')}`)
    err.statusCode = 400
    throw err
  }

  const match = await findMatchById(matchId)
  if (!match) throw notFound('Match not found.')

  // Server-side match-state rule (Part 4) — never rely on a disabled
  // frontend button alone.
  if (match.status !== 'upcoming') {
    throw conflict(`Cannot change availability once a match is '${match.status}'.`)
  }

  const player = await findPlayerByUserId(userId)
  if (!isEligible(player, match)) {
    throw forbidden('You are not eligible to respond to this match (not on either team).')
  }

  const row = await upsertAvailability(match.id, player.id, status)
  return { eligible: true, status: row.status }
}

export async function listMatchAvailability(matchId) {
  const match = await findMatchById(matchId)
  if (!match) throw notFound('Match not found.')
  const rows = await listAvailabilityForMatch(match.id, match.team_a_id, match.team_b_id)
  return rows.map((r) => ({ playerId: r.player_id, name: r.name, teamId: r.team_id, status: r.status, respondedAt: r.responded_at }))
}
