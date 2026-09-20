// Phase 5 — real match creation/setup. Deliberately plain thrown Errors with
// `.statusCode` (the generic branch errorHandler.js already had for anything
// that isn't a scoring/correction ScoringError) rather than extending that
// domain's error codes — match setup isn't part of the replay/cricket-rules
// domain, it's request validation, same tier as auth.controller.js's checks.

import { findMatchByIdWithTeams, createMatch as createMatchModel, updateMatch } from '../models/match.model.js'
import { findTeamById } from '../models/team.model.js'
import { findGroundById } from '../models/ground.model.js'
import { countPlayingXiByTeam } from '../repositories/matchPlayer.repository.js'
import { createSlotsForMatch, findSlotsByMatch, markSlotsCompletedForMatch, insertAssignmentEvent } from '../models/matchUmpireSlot.model.js'
import { ensureEarningRecordsForMatch } from '../models/umpireEarning.model.js'
import { pool } from '../config/db.js'
import { logger } from '../utils/logger.js'

const MIN_PLAYING_XI = 2 // absolute floor: need a striker and a non-striker to start batting
const DEFAULT_MAX_PLAYING_XI = 11

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

// `details` (U9) mirrors the shape domain error classes already expose —
// errorHandler.js's generic statusCode branch passes it through the same
// way, so a plain match-setup conflict can still carry structured data
// (e.g. slot counts) for the frontend without borrowing a domain's error
// codes, matching this file's own stated reason for staying plain Errors.
function conflict(message, details = {}) {
  const err = new Error(message)
  err.statusCode = 409
  err.details = details
  return err
}

function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

// groundId/requiredUmpires (U3) are optional — omitted, a match behaves
// exactly as before (ground_id NULL, no umpire slots), matching U1's
// no-fabricated-backfill stance for every match created before this phase.
export async function createMatch({ teamAId, teamBId, venue, matchDate, oversPerInnings, ballsPerOver, rules, groundId, requiredUmpires }) {
  if (!Number.isInteger(teamAId) || !Number.isInteger(teamBId)) {
    throw badRequest('teamAId and teamBId are required.')
  }
  if (teamAId === teamBId) {
    throw badRequest('teamAId and teamBId must be different teams.')
  }
  if (!matchDate || Number.isNaN(new Date(matchDate).getTime())) {
    throw badRequest('matchDate must be a valid date.')
  }
  if (oversPerInnings !== undefined && oversPerInnings !== null && (!Number.isInteger(oversPerInnings) || oversPerInnings <= 0)) {
    throw badRequest('oversPerInnings must be a positive integer.')
  }
  if (ballsPerOver !== undefined && (!Number.isInteger(ballsPerOver) || ballsPerOver <= 0)) {
    throw badRequest('ballsPerOver must be a positive integer.')
  }
  if (requiredUmpires !== undefined && requiredUmpires !== null && (!Number.isInteger(requiredUmpires) || requiredUmpires < 0)) {
    throw badRequest('requiredUmpires must be a non-negative integer.')
  }

  // Never trust frontend-supplied team/ground identity beyond the id — confirm the rows exist.
  const [teamA, teamB, ground] = await Promise.all([
    findTeamById(teamAId),
    findTeamById(teamBId),
    groundId != null ? findGroundById(groundId) : Promise.resolve(undefined),
  ])
  if (!teamA || !teamB) {
    throw badRequest('teamAId and teamBId must reference existing teams.')
  }
  if (groundId != null && !ground) {
    throw badRequest('groundId must reference an existing ground.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const match = await createMatchModel(
      {
        teamAId,
        teamBId,
        venue: venue || null,
        matchDate,
        oversPerInnings: oversPerInnings ?? null,
        ballsPerOver: ballsPerOver ?? 6,
        rules: rules && typeof rules === 'object' ? rules : {},
        groundId: groundId ?? null,
        requiredUmpires: requiredUmpires ?? 0,
      },
      client
    )
    if (match.required_umpires > 0) {
      await createSlotsForMatch(match.id, match.required_umpires, client)
    }
    await client.query('COMMIT')
    return match
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function setToss(matchId, { tossWinnerId, tossDecision }) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')
  if (match.status !== 'upcoming') {
    throw conflict(`Cannot set the toss once a match is '${match.status}'.`)
  }
  if (![match.team_a_id, match.team_b_id].includes(tossWinnerId)) {
    throw badRequest('tossWinnerId must be one of the two teams in this match.')
  }
  if (!['bat', 'bowl'].includes(tossDecision)) {
    throw badRequest("tossDecision must be 'bat' or 'bowl'.")
  }

  return updateMatch(matchId, { toss_winner_id: tossWinnerId, toss_decision: tossDecision })
}

/** Derives which team bats first from the toss — the one server-side place
 * this decision is made, so a client never has to (and can't disagree). */
export function battingTeamFromToss(match) {
  if (!match.toss_winner_id || !match.toss_decision) return null
  const otherTeamId = match.toss_winner_id === match.team_a_id ? match.team_b_id : match.team_a_id
  return match.toss_decision === 'bat' ? match.toss_winner_id : otherTeamId
}

// U9 — a match with unfilled required umpire slots (U8's discovered gap) is
// no longer silently startable, but it's a warning, not a hard block:
// omitting confirmUnderstaffed (or sending it false) on a genuinely
// understaffed match returns 409 with the real fill counts so the caller
// can show "1 of 2 umpire slots filled — start anyway?"; sending it true
// proceeds exactly as before. A match with required_umpires=0 has
// filledSlots===totalSlots===0 by construction, so it can never be
// "understaffed" and this is always a no-op for it — no special case needed.
export async function startMatch(matchId, { confirmUnderstaffed = false } = {}) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')
  if (match.status !== 'upcoming') {
    throw conflict(`Match is already '${match.status}'.`)
  }
  if (!match.toss_winner_id || !match.toss_decision) {
    throw badRequest('Toss must be recorded before starting the match.')
  }

  const maxPlayingXi = match.rules?.maxPlayers || DEFAULT_MAX_PLAYING_XI
  const counts = await countPlayingXiByTeam(match.id)
  for (const [label, teamId] of [
    ['Team A', match.team_a_id],
    ['Team B', match.team_b_id],
  ]) {
    const count = counts.get(teamId) || 0
    if (count < MIN_PLAYING_XI) {
      throw badRequest(`${label} needs at least ${MIN_PLAYING_XI} playing XI players before the match can start (has ${count}).`)
    }
    if (count > maxPlayingXi) {
      throw badRequest(`${label} has ${count} playing XI players, more than this match's limit of ${maxPlayingXi}.`)
    }
  }

  const slots = await findSlotsByMatch(match.id)
  const totalSlots = slots.length
  const filledSlots = slots.filter((s) => s.status === 'ASSIGNED').length
  if (filledSlots < totalSlots && !confirmUnderstaffed) {
    throw conflict(`Only ${filledSlots} of ${totalSlots} required umpire slots are filled.`, { understaffed: true, filledSlots, totalSlots })
  }

  return updateMatch(match.id, { status: 'live' })
}

// Ground Owner "Match is Over" — the common case is that the scoring engine
// already auto-completed the match (scoring.service.js::maybeCompleteInnings
// writes status='completed' + the real winner/margin the instant a target is
// chased or a side is all out, in the same transaction as the deciding
// delivery). This function's job is narrower than that: (a) if the match is
// already 'completed', it's an idempotent no-op — never a double transition,
// never overwrites a real result with a manual one — so the Ground Owner's
// button is always safe to press regardless of whether scoring already got
// there; (b) if the match is still 'live' (stopped early — rain, forfeit,
// any reason cricket itself never decided a result), it manually transitions
// to 'completed' using the schema's own existing, otherwise-unused
// result_type='NO_RESULT' value — the honest answer for "a result the
// match itself never produced", not an invented new state.
export async function completeMatchManually(matchId) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')
  if (match.status === 'completed' || match.status === 'finalized') {
    return { match, transitioned: false }
  }
  if (match.status !== 'live') {
    throw conflict(`Cannot complete a match that is '${match.status}' — it must be live first.`)
  }

  // Transactional (Phase 23) so the status flip and the umpire slots'
  // ASSIGNED -> COMPLETED officiating-credit write can never diverge — a
  // crash between them would otherwise leave a completed match whose
  // umpire never got credit, or vice versa.
  const client = await pool.connect()
  let updated
  try {
    await client.query('BEGIN')
    updated = await updateMatch(
      match.id,
      { status: 'completed', completed_at: new Date(), result_type: 'NO_RESULT', result: 'Match ended without a result.' },
      client,
    )
    const completedSlots = await markSlotsCompletedForMatch(match.id, client)
    for (const slot of completedSlots) {
      await insertAssignmentEvent({ slotId: slot.id, matchId: match.id, umpireUserId: slot.umpire_user_id, eventType: 'COMPLETED' }, client)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  // Umpire Communication & Commercial 2.0 — AFTER commit, not inside the
  // transaction: a caught error mid-transaction still leaves Postgres in an
  // aborted state, so swallowing it and proceeding to COMMIT would silently
  // roll back the officiating-credit writes above too. Running it
  // post-commit, best-effort (same posture as every notification/realtime
  // side-effect in this codebase), means a bug here can never undo a real
  // match completion — and it's idempotent (ON CONFLICT DO NOTHING), so the
  // read-side's own defensive call self-heals if this one fails.
  try {
    await ensureEarningRecordsForMatch(match.id)
  } catch (err) {
    logger.error('ensureEarningRecordsForMatch failed after completeMatchManually', { matchId: match.id, error: err.message })
  }

  return { match: updated, transitioned: true }
}

/** Locks the official record. Only reachable once a result exists — a
 * 'completed' match, never 'upcoming'/'live'. Irreversible by design (no
 * un-finalize path): after this, correction.service.js's MATCH_LOCKED check
 * rejects every correction unconditionally. */
export async function finalizeMatch(matchId) {
  const match = await findMatchByIdWithTeams(matchId)
  if (!match) throw notFound('Match not found.')
  if (match.status === 'finalized') {
    throw conflict('Match is already finalized.')
  }
  if (match.status !== 'completed') {
    throw conflict(`Cannot finalize a match that is '${match.status}' — it must be completed first.`)
  }

  return updateMatch(match.id, { status: 'finalized', finalized_at: new Date() })
}
