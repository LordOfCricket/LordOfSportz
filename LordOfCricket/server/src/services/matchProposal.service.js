import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'
import { findPlayersByIds } from '../models/player.model.js'
import { findGroundById } from '../models/ground.model.js'
import * as bookingRepo from '../repositories/groundBooking.repository.js'
import * as engineRepo from '../repositories/bookingEngine.repository.js'
import * as proposalRepo from '../repositories/matchProposal.repository.js'
import { normalizeParticipantIds, assertPlayersExist } from '../domain/booking/participants.js'
import { validateBookingTimeRange } from '../domain/booking/teamBookingValidation.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'
import { internal as engine } from './bookingConflict.service.js'
import * as auditLogService from './groundAuditLog.service.js'
import * as notificationService from './groundNotification.service.js'

// Phase 25 — team match proposals ("looking for an opponent"). Reuses
// bookingConflict.service.js's internals (insertBookingWithSlots, actor/
// team authorization, booking-limit checks, exclusion-violation
// translation, the generic status-transition helper) rather than
// duplicating the conflict engine — see that file's own header comment for
// why the reuse surface is exported the way it is. An OPEN proposal's
// ground/team/time reservation IS its linked ground_bookings row
// (status='PROPOSED', booking_purpose='MATCH', booking_teams has one HOME
// row) — this file adds only the proposal-specific metadata/lifecycle on
// top, never a second reservation mechanism.

const DEFAULT_PROPOSAL_TTL_HOURS = Number(process.env.PROPOSAL_EXPIRY_HOURS ?? 48)
const MAX_OPEN_PROPOSALS_PER_TEAM = Number(process.env.MAX_OPEN_PROPOSALS_PER_TEAM ?? 5)

async function assertOpenProposalLimit(teamId) {
  const count = await proposalRepo.countOpenProposalsForTeam(teamId)
  if (count >= MAX_OPEN_PROPOSALS_PER_TEAM) {
    throw new BookingError(BOOKING_ERROR_CODES.OPEN_PROPOSAL_LIMIT_REACHED, `This team already has ${MAX_OPEN_PROPOSALS_PER_TEAM} open proposals, the maximum allowed.`)
  }
}

/**
 * Creates an OPEN match proposal: validates exactly like a direct MATCH
 * booking (§3 — ground/time/team/player checks are the same ones
 * createTeamBooking already runs, via the shared internals), then writes a
 * PROPOSED ground_bookings row (blocking — reserves the ground and the
 * proposing team's/players' slots immediately, §4/§5) plus its
 * match_proposals metadata row, atomically.
 */
export async function createMatchProposal({
  ground, actingUserId, matchFormat = null, startTime, endTime,
  teamId, participantPlayerIds, purpose = null, notes = null, clientActionId = null,
  expiresInHours = DEFAULT_PROPOSAL_TTL_HOURS,
}) {
  if (ground.status !== 'ACTIVE') {
    throw new BookingError(BOOKING_ERROR_CODES.GROUND_CLOSED, 'This ground is not currently accepting bookings.')
  }
  if (teamId == null) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A match proposal requires a proposing team.')
  }
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'expiresInHours must be a positive number.')
  }

  validateBookingTimeRange({ startTime, endTime, ground })

  const actingPlayer = await engine.resolveActingPlayer(actingUserId)
  const team = await engine.assertTeamAuthority(actingPlayer, teamId)

  const playerIds = normalizeParticipantIds(participantPlayerIds)
  const foundPlayers = await findPlayersByIds(playerIds)
  assertPlayersExist(playerIds, foundPlayers)

  if (clientActionId) {
    const existing = await bookingRepo.findByClientActionId(clientActionId)
    if (existing) {
      const proposal = await proposalRepo.findByBookingId(existing.id)
      if (proposal) return { proposal, booking: existing, idempotentReplay: true }
    }
  }

  await engine.assertBookingLimits({ teamId, playerIds })
  await assertOpenProposalLimit(teamId)

  // A proposal can never legitimately outlive its own match — clamp the
  // requested TTL so proposal_expires_at is never after startTime;
  // otherwise an "OPEN" proposal could still be accepted for a slot whose
  // start time has already passed.
  const requestedExpiry = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
  const proposalExpiresAt = requestedExpiry.getTime() < startTime.getTime() ? requestedExpiry : new Date(startTime.getTime())

  const client = await pool.connect()
  let booking
  let proposal
  try {
    await client.query('BEGIN')
    await engineRepo.sweepExpiredHolds(client, ground.id)
    booking = await engine.insertBookingWithSlots(client, {
      groundId: ground.id,
      publicBookingId: generatePublicId('LOC', 6),
      actingUserId,
      customerName: `${team.name} (proposal)`,
      startTime,
      endTime,
      purpose,
      notes,
      clientActionId,
      bookingPurpose: 'MATCH',
      matchFormat,
      status: 'PROPOSED',
      teamId,
      teamRole: 'HOME',
      playerIds,
      holdExpiresAt: proposalExpiresAt,
    })
    proposal = await proposalRepo.insertProposal(client, {
      publicProposalId: generatePublicId('PRO', 8),
      groundId: ground.id,
      bookingId: booking.id,
      proposingTeamId: teamId,
      proposalExpiresAt,
      createdBy: actingUserId,
    })
    booking = (await bookingRepo.linkProposal(client, booking.id, proposal.id)) || booking
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'PROPOSAL', entityId: proposal.id, action: 'CREATED', actorUserId: actingUserId, newValue: proposal })
  return { proposal, booking, idempotentReplay: false }
}

function assertProposalActionable(proposal) {
  if (proposal.status === 'OPEN') return
  if (proposal.status === 'CONFIRMED') throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_ALREADY_ACCEPTED, 'This proposal has already been accepted.')
  if (proposal.status === 'CANCELLED') throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_CANCELLED, 'This proposal has been cancelled.')
  if (proposal.status === 'EXPIRED') throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_EXPIRED, 'This proposal has expired.')
  throw new BookingError(BOOKING_ERROR_CODES.INVALID_PROPOSAL_STATE, `Proposal is in an unexpected state: ${proposal.status}.`)
}

/**
 * Accepts an OPEN proposal on behalf of `acceptingTeamId`. The brief's
 * 19-step conceptual sequence (§7) collapses to two atomic phases inside
 * one transaction:
 *
 *  1. CLAIM — a single conditional UPDATE (proposalRepo.claimProposal,
 *     `WHERE status = 'OPEN' AND proposal_expires_at > NOW()`) is the real
 *     concurrency guarantee for §9/§10 (double acceptance, two different
 *     teams racing for the same proposal): Postgres serializes concurrent
 *     UPDATEs to the same row, so only one caller can ever see 1 row
 *     affected — everyone else gets 0 and fails cleanly, without ever
 *     touching booking_teams/slots.
 *  2. ATTACH — only the CLAIM's winner proceeds to insert the accepting
 *     team's booking_teams/booking_team_slots/participants rows through
 *     the exact same EXCLUDE-constrained path every other booking uses
 *     (§13/§14 — fresh re-validation, not the state captured at proposal
 *     creation). If THAT fails (the accepting team or one of its players
 *     turns out to be unavailable), the whole transaction — including the
 *     claim — rolls back, leaving the proposal exactly as OPEN as it was
 *     before this attempt, ready for a genuinely available team to accept.
 */
export async function acceptMatchProposal({ publicProposalId, actingUserId, acceptingTeamId, participantPlayerIds }) {
  const proposal = await proposalRepo.findByPublicId(publicProposalId)
  if (!proposal) throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')

  // Idempotent replay (§23 — double-click/retry): the SAME team accepting
  // again after already having won is a no-op success, not an error.
  if (proposal.status === 'CONFIRMED' && proposal.accepted_by_team_id === acceptingTeamId) {
    const booking = await bookingRepo.findById(proposal.booking_id)
    return { proposal, booking, idempotentReplay: true }
  }
  assertProposalActionable(proposal)

  if (acceptingTeamId === proposal.proposing_team_id) {
    throw new BookingError(BOOKING_ERROR_CODES.SELF_ACCEPT_NOT_ALLOWED, 'A team cannot accept its own proposal.')
  }

  const actingPlayer = await engine.resolveActingPlayer(actingUserId)
  await engine.assertTeamAuthority(actingPlayer, acceptingTeamId)

  const playerIds = normalizeParticipantIds(participantPlayerIds)
  const foundPlayers = await findPlayersByIds(playerIds)
  assertPlayersExist(playerIds, foundPlayers)

  await engine.assertBookingLimits({ teamId: acceptingTeamId, playerIds })

  const client = await pool.connect()
  let confirmedProposal
  let confirmedBooking
  try {
    await client.query('BEGIN')

    const claimed = await proposalRepo.claimProposal(client, { id: proposal.id, acceptingTeamId, acceptingUserId: actingUserId })
    if (!claimed) {
      // Lost the claim — reload to report the SPECIFIC reason (someone else
      // already accepted, the proposing team cancelled it, or it expired,
      // all between our first read above and this transaction).
      const current = (await proposalRepo.findById(proposal.id, client)) || proposal
      assertProposalActionable(current)
      // assertProposalActionable throws for every non-OPEN status; reaching
      // here means current.status is somehow still OPEN yet the claim's
      // expiry predicate failed (expired in the exact instant between the
      // two reads) — a genuine, honest race, not a bug.
      throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_EXPIRED, 'This proposal has expired.')
    }

    const booking = await bookingRepo.findById(claimed.booking_id, client)
    if (!booking || booking.status !== 'PROPOSED') {
      throw new BookingError(BOOKING_ERROR_CODES.INVALID_PROPOSAL_STATE, 'This proposal is no longer available to accept.')
    }

    // §15 — re-validate the ground for real, not just trust the state
    // captured at proposal-creation time (it may have been suspended, or
    // its operating hours reconfigured, since).
    const ground = await findGroundById(booking.ground_id)
    if (!ground || ground.status !== 'ACTIVE') {
      throw new BookingError(BOOKING_ERROR_CODES.GROUND_CLOSED, 'This ground is no longer accepting bookings.')
    }
    validateBookingTimeRange({ startTime: new Date(booking.start_time), endTime: new Date(booking.end_time), ground })

    // §13/§14 — the accepting team's own fresh conflict check. Any
    // EXCLUDE-constraint violation here rolls back the CLAIM above too
    // (same transaction), so the proposal genuinely stays OPEN.
    let conflictingPlayerId = null
    try {
      await engineRepo.insertBookingTeam(client, { bookingId: booking.id, teamId: acceptingTeamId, role: 'AWAY' })
      await engineRepo.insertTeamSlot(client, { bookingId: booking.id, teamId: acceptingTeamId, startTime: booking.start_time, endTime: booking.end_time })
      for (const playerId of playerIds) {
        conflictingPlayerId = playerId
        await engineRepo.insertPlayerSlot(client, { bookingId: booking.id, playerId, startTime: booking.start_time, endTime: booking.end_time })
        await engineRepo.upsertParticipant(client, { bookingId: booking.id, playerId })
      }
    } catch (err) {
      if (err.code === '23P01') {
        const translated = engine.translateExclusionViolation(err, { conflictingPlayerId })
        if (translated) throw translated
      }
      throw err
    }

    confirmedBooking = await engine.transitionStatus(client, booking, 'CONFIRMED', {})
    confirmedProposal = claimed

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    await auditLogService.logEvent({
      entityType: 'PROPOSAL',
      entityId: proposal.id,
      action: 'ACCEPT_FAILED',
      actorUserId: actingUserId,
      previousValue: { proposalStatus: proposal.status },
      newValue: { errorCode: err.code || null, message: err.message },
    })
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'PROPOSAL', entityId: confirmedProposal.id, action: 'ACCEPTED', actorUserId: actingUserId, previousValue: { status: 'OPEN' }, newValue: confirmedProposal })
  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: confirmedBooking.id, action: 'CONFIRMED', actorUserId: actingUserId, newValue: confirmedBooking })

  const participants = await engineRepo.findParticipantsForBooking(confirmedBooking.id)
  for (const p of participants) {
    if (!p.user_id) continue
    await notificationService.createNotification({
      userId: p.user_id,
      type: 'PROPOSAL_ACCEPTED',
      title: 'Match confirmed',
      body: `A match proposal (${confirmedProposal.public_proposal_id}) has been accepted and is now confirmed.`,
      relatedBookingId: confirmedBooking.id,
    })
  }

  return { proposal: confirmedProposal, booking: confirmedBooking, idempotentReplay: false }
}

/** §18 — only a current member of the proposing team may cancel their own
 * OPEN proposal. Deliberately rejects (rather than silently redirecting to
 * the ordinary booking-cancel flow) once a proposal has moved past OPEN —
 * a CONFIRMED match must be withdrawn via the real booking-cancel endpoint
 * (bookingConflict.service.js#cancelTeamBooking, which every team on the
 * match — not just the original proposer — is already authorized to use),
 * never through this proposal-specific one. */
export async function cancelMatchProposal(publicProposalId, { actingUserId, reason = null }) {
  const proposal = await proposalRepo.findByPublicId(publicProposalId)
  if (!proposal) throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')
  assertProposalActionable(proposal)

  const actingPlayer = await engine.resolveActingPlayer(actingUserId)
  if (actingPlayer.team_id !== proposal.proposing_team_id) {
    throw new BookingError(BOOKING_ERROR_CODES.UNAUTHORIZED_TEAM_ACTION, 'You are not currently a member of the proposing team.')
  }

  const booking = await bookingRepo.findById(proposal.booking_id)
  if (!booking) throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')

  const client = await pool.connect()
  let updatedProposal
  let updatedBooking
  try {
    await client.query('BEGIN')
    updatedBooking = await engine.transitionStatus(client, booking, 'CANCELLED', { cancelled_at: new Date(), cancelled_by: actingUserId, cancellation_reason: reason })
    updatedProposal = await proposalRepo.updateProposalStatus(client, proposal.id, 'OPEN', 'CANCELLED', {})
    if (!updatedProposal) {
      // Someone accepted between our read above and this write — the
      // booking transition above would already have failed first in that
      // case (it's no longer PROPOSED), so this is only reachable for a
      // genuinely unexpected concurrent state change; fail safely.
      throw new BookingError(BOOKING_ERROR_CODES.INVALID_PROPOSAL_STATE, 'This proposal changed state — refresh and try again.')
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'PROPOSAL', entityId: updatedProposal.id, action: 'CANCELLED', actorUserId: actingUserId, previousValue: proposal, newValue: updatedProposal })
  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: updatedBooking.id, action: 'CANCELLED', actorUserId: actingUserId, previousValue: booking, newValue: updatedBooking })
  return updatedProposal
}

export async function findProposalDetail(publicProposalId) {
  const proposal = await proposalRepo.findByPublicId(publicProposalId)
  if (!proposal) throw new BookingError(BOOKING_ERROR_CODES.PROPOSAL_NOT_FOUND, 'Proposal not found.')
  const booking = await bookingRepo.findById(proposal.booking_id)
  return { proposal, booking }
}

export async function listOpenProposalsForGround(groundId) {
  return proposalRepo.listOpenProposalsForGround(groundId)
}

/** §6 — the proactive sweep, callable on-demand or by a future scheduler
 * (in addition to the lazy per-transaction sweep every create/accept
 * already runs). Sweeps once per distinct ground (sweepExpiredHolds clears
 * every stale row at that ground in one pass, so re-sweeping the same
 * ground per expired proposal would be redundant work, not a correctness
 * issue — this just avoids it). Not wired to an automatic interval in this
 * phase — see the Phase C completion report for why that's an explicit,
 * flagged decision rather than a silent gap. */
export async function expireStaleProposals() {
  const expired = await proposalRepo.listExpiredOpenProposals()
  const groundIds = [...new Set(expired.map((p) => p.ground_id))]
  let count = 0
  for (const groundId of groundIds) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const swept = await engineRepo.sweepExpiredHolds(client, groundId)
      await client.query('COMMIT')
      count += swept.length
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }
  for (const proposal of expired) {
    await auditLogService.logEvent({ entityType: 'PROPOSAL', entityId: proposal.id, action: 'EXPIRED', newValue: { proposalId: proposal.id } })
  }
  return count
}
