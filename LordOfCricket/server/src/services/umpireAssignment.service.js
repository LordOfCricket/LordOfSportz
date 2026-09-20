import { pool } from '../config/db.js'
import { findMatchById, findMatchByIdWithTeams } from '../models/match.model.js'
import { isApprovedUmpireUser } from '../models/umpireRequest.model.js'
import {
  findSlotsByMatch,
  hasActiveSlotAssignment,
  claimAvailableSlot,
  cancelMyAssignment,
  findActiveAssignedMatchesForUmpire,
  insertAssignmentEvent,
  checkInSlot,
} from '../models/matchUmpireSlot.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { findUserById } from '../models/user.model.js'
import { findWeeklyAvailability, findDateAvailability } from '../models/umpireAvailability.model.js'
import { expirePendingProposalsForSlot } from '../models/umpireProposal.model.js'
import { createNotification } from './groundNotification.service.js'
import { UmpireAssignmentError, UMPIRE_ASSIGNMENT_ERROR_CODES as CODES } from '../domain/umpireAssignment/errors.js'
import { estimateMatchTimeRange, isAssignmentLocked } from '../domain/umpireAssignment/matchTimeRange.js'
import { rangesOverlap } from '../domain/booking/availability.js'
import { isUmpireAvailableForMatch } from '../domain/umpireAssignment/availability.js'

// Shared by applyForSlot (self-service) and assignReplacement (ground-owner-
// initiated) — every path that puts a specific umpire into a specific slot
// must pass the exact same three gates (approved-umpire, cross-match
// overlap, availability), or a replacement could silently reintroduce the
// double-booking bug U10 closed. `candidateUser` must be the real user row
// (from findUserById), not a manufactured object — isApprovedUmpireUser
// needs its actual role/player_type. Runs INSIDE the caller's transaction
// scope (so the overlap/availability reads are serialized against the
// caller's advisory lock); throws a typed UmpireAssignmentError and never
// claims anything itself — the caller performs the actual claim/reassign
// write only once this resolves without throwing.
export async function assertUmpireEligibleForMatch(match, candidateUser, client) {
  if (!(await isApprovedUmpireUser(candidateUser))) {
    throw new UmpireAssignmentError(CODES.NOT_APPROVED_UMPIRE, 'This umpire is not an approved umpire.')
  }

  const candidateRange = estimateMatchTimeRange(match)
  const otherAssignments = await findActiveAssignedMatchesForUmpire(candidateUser.id, match.id, client)
  const conflict = otherAssignments.find((other) => {
    const otherRange = estimateMatchTimeRange(other)
    return rangesOverlap(candidateRange.start, candidateRange.end, otherRange.start, otherRange.end)
  })
  if (conflict) {
    throw new UmpireAssignmentError(
      CODES.OVERLAPPING_ASSIGNMENT,
      'This umpire already has an assignment that overlaps with this match\'s time — an umpire can only officiate one match at a time.',
    )
  }

  const [weeklyRules, dateOverrides] = await Promise.all([
    findWeeklyAvailability(candidateUser.id, client),
    findDateAvailability(candidateUser.id, client),
  ])
  if (!isUmpireAvailableForMatch(candidateRange, weeklyRules, dateOverrides)) {
    throw new UmpireAssignmentError(CODES.NOT_AVAILABLE, 'This umpire has marked themselves unavailable at this match\'s scheduled time.')
  }
}

// U7 — best-effort, never blocks the primary action (same posture
// groundNotification.service.js's createNotification already guarantees
// internally: it swallows its own write failures). Notifies BOTH the
// umpire (confirming their own status change) and the ground's active
// owner(s), if the match has a real ground — a ground-less legacy match
// simply notifies the umpire only, honestly (no owner to notify).
async function notifySlotEvent(matchId, umpireUserId, type) {
  const [match, umpire, slots] = await Promise.all([findMatchByIdWithTeams(matchId), findUserById(umpireUserId), findSlotsByMatch(matchId)])
  if (!match || !umpire) return

  const matchLabel = `${match.team_a_name} vs ${match.team_b_name}`
  const isAssigned = type === 'UMPIRE_SLOT_ASSIGNED'
  const total = slots.length
  const filled = slots.filter((s) => s.status === 'ASSIGNED').length

  await createNotification({
    userId: umpireUserId,
    type,
    title: isAssigned ? "You're assigned to umpire a match" : 'Your umpire assignment was cancelled',
    body: matchLabel,
    relatedMatchId: matchId,
  })

  if (match.ground_id) {
    const ownerIds = await findActiveGroundOwnerUserIds(match.ground_id)
    await Promise.all(
      ownerIds.map((ownerId) =>
        createNotification({
          userId: ownerId,
          type,
          title: isAssigned ? 'An umpire slot was filled' : 'An umpire slot needs to be refilled',
          body: isAssigned
            ? `${umpire.name} is now assigned to umpire ${matchLabel}. ${filled}/${total} umpire slots filled.`
            : `${umpire.name} cancelled their umpire assignment for ${matchLabel}. ${filled}/${total} umpire slots filled.`,
          relatedMatchId: matchId,
        }),
      ),
    )

    // Distinct, separate signal from the per-assignment notification above —
    // only fires the instant this assignment is what brought the match to
    // fully staffed, not on every assignment.
    if (isAssigned && total > 0 && filled === total) {
      await Promise.all(
        ownerIds.map((ownerId) =>
          createNotification({
            userId: ownerId,
            type: 'UMPIRE_SLOTS_FULLY_STAFFED',
            title: 'All umpire slots are now filled',
            body: `${matchLabel} is fully staffed with umpires.`,
            relatedMatchId: matchId,
          }),
        ),
      )
    }
  }
}

export async function listSlots(matchId) {
  const match = await findMatchById(matchId)
  if (!match) return null
  return findSlotsByMatch(matchId)
}

// Gate 1 (approved umpire) is re-checked here, independently of
// requireScorer/requireMatchScorer — this route sits behind plain
// requireAuth only, since there is (by definition) no existing assignment
// yet for requireMatchScorer's Gate 2 to check.
export async function applyForSlot({ matchId, user }) {
  const match = await findMatchById(matchId)
  if (!match) throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Match not found.')

  if (!(await isApprovedUmpireUser(user))) {
    throw new UmpireAssignmentError(CODES.NOT_APPROVED_UMPIRE, 'Only an approved umpire may apply to umpire a match.')
  }

  // Applications close once the match leaves 'upcoming' — matches the
  // brief's explicit UPCOMING-only table; LIVE/COMPLETED/FINALIZED all deny.
  if (match.status !== 'upcoming') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, 'This match is no longer accepting umpire applications.')
  }

  // Everything from here on runs inside one transaction, serialized per
  // umpire by a Postgres advisory lock (pg_advisory_xact_lock, released
  // automatically at COMMIT/ROLLBACK — same transaction shape
  // groundBooking.service.js already uses elsewhere in this codebase).
  // matches has no end time to build a real DB exclusion constraint from
  // (it's derived from a JOINed row, not local columns), so the advisory
  // lock is what closes the "two concurrent brand-new applications for two
  // overlapping matches by the same umpire, both pass a pre-check" race —
  // a second concurrent apply by this same umpire simply waits here, then
  // re-evaluates against whatever the first one just committed.
  const client = await pool.connect()
  let slot
  let expiredProposals = []
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [user.id])

    if (await hasActiveSlotAssignment(matchId, user.id, client)) {
      throw new UmpireAssignmentError(CODES.ALREADY_ASSIGNED, 'You are already assigned to umpire this match.')
    }

    // Overlap + availability — the same shared gate assignReplacement uses,
    // so a self-apply and a ground-owner-initiated replacement can never
    // diverge in what they consider "eligible".
    await assertUmpireEligibleForMatch(match, user, client)

    try {
      slot = await claimAvailableSlot(matchId, user.id, client)
    } catch (err) {
      // The partial unique index (match_id, umpire_user_id) WHERE
      // status='ASSIGNED' is the real concurrency backstop for this same
      // scenario (two of THIS user's own concurrent applies racing for two
      // different open slots on the SAME match) — the pre-check above
      // closes the common case, this closes the race the pre-check can't.
      if (err.code === '23505') {
        throw new UmpireAssignmentError(CODES.ALREADY_ASSIGNED, 'You are already assigned to umpire this match.')
      }
      throw err
    }
    if (!slot) {
      throw new UmpireAssignmentError(CODES.NO_SLOT_AVAILABLE, 'No umpire slot is available for this match.')
    }

    await insertAssignmentEvent({ slotId: slot.id, matchId, umpireUserId: user.id, eventType: 'ASSIGNED', recordedBy: user.id }, client)

    // A direct self-apply can win a slot that also has pending Ground-Owner
    // proposals out to other umpires (or even this same user) — those must
    // not linger as PENDING once the slot is gone.
    expiredProposals = await expirePendingProposalsForSlot(slot.id, null, client)

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await notifySlotEvent(matchId, user.id, 'UMPIRE_SLOT_ASSIGNED')
  await Promise.all(
    expiredProposals.filter((p) => p.umpire_user_id !== user.id).map((p) =>
      createNotification({
        userId: p.umpire_user_id,
        type: 'UMPIRE_PROPOSAL_EXPIRED',
        title: 'That umpiring opportunity was filled',
        relatedMatchId: matchId,
      }),
    ),
  )
  return slot
}

export async function cancelAssignment({ matchId, user, reason }) {
  const match = await findMatchById(matchId)
  if (!match) throw new UmpireAssignmentError(CODES.MATCH_NOT_FOUND, 'Match not found.')

  // U3.1 product decision: self-cancellation is UPCOMING-only, same window
  // as application. Once a match goes live, an umpire stepping away is an
  // operational/replacement problem, handled by markNoShow + assignReplacement
  // below (Phase 23) rather than by normal self-cancel.
  if (match.status !== 'upcoming') {
    throw new UmpireAssignmentError(CODES.MATCH_NOT_ELIGIBLE, 'This match is no longer eligible for umpire assignment changes.')
  }

  // Phase 2 (Umpire Interest+Assignment audit) — 24h confirmation lock.
  // Scoped deliberately to THIS action only: self-cancelling a CONFIRMED
  // (ASSIGNED) slot is the one "normal" change that can strand a match
  // umpire-less at short notice, so it locks. Filling a still-open slot
  // (applyForSlot/proposeUmpire/respondToProposal accept) is NOT gated by
  // this anywhere in this file — the existing emergency path
  // (markMatchUmpireNoShow + assignReplacementUmpire, groundOwner.service.js)
  // only ever operates on a NO_SHOW slot and stays open regardless of this
  // lock, exactly as before. If an umpire genuinely cannot officiate this
  // close to kickoff, the ground owner marking them a no-show and pulling a
  // replacement is the intended path now, not silent self-cancellation.
  if (isAssignmentLocked(match)) {
    throw new UmpireAssignmentError(
      CODES.ASSIGNMENT_LOCKED,
      'Assignment changes are locked within 24 hours of the match start. Contact the ground owner if you can no longer officiate.',
    )
  }

  // Scoped to (matchId, user.id) inside cancelMyAssignment's WHERE clause —
  // never a slot id supplied by the caller — so this can only ever cancel
  // the CALLING user's own assignment. Cancel + event log run in one
  // transaction so the two can never diverge (a crash between them would
  // otherwise leave a CANCELLED slot with no matching history row).
  const client = await pool.connect()
  let slot
  try {
    await client.query('BEGIN')
    slot = await cancelMyAssignment(matchId, user.id, reason ?? null, client)
    if (!slot) {
      throw new UmpireAssignmentError(CODES.ASSIGNMENT_NOT_FOUND, 'You do not have an active umpire assignment for this match.')
    }
    await insertAssignmentEvent({ slotId: slot.id, matchId, umpireUserId: user.id, eventType: 'CANCELLED', recordedBy: user.id }, client)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await notifySlotEvent(matchId, user.id, 'UMPIRE_SLOT_CANCELLED')
  return slot
}

// Check-in (Workstream E) — route is gated by requireMatchScorerByParam, so
// by the time this runs the caller is already confirmed to hold an active
// ASSIGNED slot on this match; checkInSlot's own WHERE clause re-confirms it
// anyway (never trusts the gate alone) and is naturally idempotent. Location
// is optional and only ever stored, never required or exposed publicly —
// the ground owner is the only other party who can see it (via the
// staffing panel), consistent with "never expose precise location publicly".
export async function checkIn({ matchId, user, latitude, longitude }) {
  const slot = await checkInSlot(matchId, user.id, { latitude, longitude })
  if (!slot) {
    throw new UmpireAssignmentError(CODES.ASSIGNMENT_NOT_FOUND, 'You do not have an active umpire assignment for this match.')
  }

  const match = await findMatchByIdWithTeams(matchId)
  if (match?.ground_id) {
    const [umpire, ownerIds] = await Promise.all([findUserById(user.id), findActiveGroundOwnerUserIds(match.ground_id)])
    await Promise.all(
      ownerIds.map((ownerId) =>
        createNotification({
          userId: ownerId,
          type: 'UMPIRE_CHECKED_IN',
          title: 'Your umpire has checked in',
          body: `${umpire.name} checked in for ${match.team_a_name} vs ${match.team_b_name}.`,
          relatedMatchId: matchId,
        }),
      ),
    )
  }

  return slot
}
