import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'
import { findTeamById } from '../models/team.model.js'
import { findPlayerByUserId, findPlayersByIds } from '../models/player.model.js'
import { findActiveMembershipForAnyRole, findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { hasActivePermission } from '../models/permission.model.js'
import { isSuperAdminUser } from '../middlewares/auth.js'
import * as bookingRepo from '../repositories/groundBooking.repository.js'
import * as engineRepo from '../repositories/bookingEngine.repository.js'
import * as proposalRepo from '../repositories/matchProposal.repository.js'
import { normalizeParticipantIds, assertPlayersExist } from '../domain/booking/participants.js'
import { validateBookingTimeRange } from '../domain/booking/teamBookingValidation.js'
import { isValidStatusTransition, isBlockingStatus } from '../domain/booking/bookingStatus.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'
import * as auditLogService from './groundAuditLog.service.js'
import * as notificationService from './groundNotification.service.js'
import { logger } from '../utils/logger.js'

// Phase 24 — the single centralized validation/mutation layer (§53) for
// MATCH/PRACTICE bookings: every route that creates or mutates one of these
// bookings calls through here, never re-implements ground/team/player
// conflict logic itself. The walk-in flow (groundBooking.service.js) is
// untouched and does not use this module — its own EXCLUDE-constraint
// pattern already does the equivalent job for its own, simpler (no team/
// player) domain.
//
// Phase 25 — match proposals (matchProposal.service.js) reuse several of
// this module's internals (the atomic insert-with-slots helper, actor/team
// authorization, booking-limit checks, exclusion-violation translation, the
// generic status-transition helper) rather than duplicating this logic —
// exported at the bottom specifically for that reuse, deliberately not a
// public HTTP-facing surface.

const MAX_ACTIVE_BOOKINGS_PER_TEAM = Number(process.env.MAX_ACTIVE_BOOKINGS_PER_TEAM ?? 10)
const MAX_ACTIVE_BOOKINGS_PER_PLAYER = Number(process.env.MAX_ACTIVE_BOOKINGS_PER_PLAYER ?? 10)

// Postgres reports the specific EXCLUDE constraint that fired on the
// INSERT/UPDATE that lost the race — this is what turns a bare 23P01 into
// the specific, honest reason §44 requires instead of one generic
// "conflict" for all three axes.
const CONSTRAINT_ERROR_CODE = {
  ground_bookings_no_overlap: BOOKING_ERROR_CODES.GROUND_SLOT_UNAVAILABLE,
  booking_team_slots_no_overlap: BOOKING_ERROR_CODES.TEAM_TIME_CONFLICT,
  booking_player_slots_no_overlap: BOOKING_ERROR_CODES.PLAYER_TIME_CONFLICT,
}

function translateExclusionViolation(err, { conflictingPlayerId } = {}) {
  const code = CONSTRAINT_ERROR_CODE[err.constraint]
  if (!code) return null
  if (code === BOOKING_ERROR_CODES.GROUND_SLOT_UNAVAILABLE) {
    return new BookingError(code, 'This ground is not available for the requested time.')
  }
  if (code === BOOKING_ERROR_CODES.TEAM_TIME_CONFLICT) {
    return new BookingError(code, 'This team already has another booking that overlaps this time.')
  }
  return new BookingError(code, `Player ${conflictingPlayerId ?? ''}`.trim() + ' already has another booking that overlaps this time.', { playerId: conflictingPlayerId })
}

async function resolveActingPlayer(userId) {
  const player = await findPlayerByUserId(userId)
  if (!player) throw new BookingError(BOOKING_ERROR_CODES.FORBIDDEN, 'Only a registered player account can perform this action.')
  return player
}

// §27/confirmed decision — any player currently on a team may act for it;
// `teams` has no owner/captain field to check instead.
async function assertTeamAuthority(actingPlayer, teamId) {
  const team = await findTeamById(teamId)
  if (!team) throw new BookingError(BOOKING_ERROR_CODES.TEAM_NOT_FOUND, 'Team not found.')
  if (actingPlayer.team_id !== teamId) {
    throw new BookingError(BOOKING_ERROR_CODES.UNAUTHORIZED_TEAM_ACTION, 'You are not currently a member of this team.')
  }
  return team
}

// §21 — booking-hoarding protection. Count-based, not overlap-based, so it
// cannot be made fully race-proof by a GIST exclusion constraint the way
// the ground/team/player conflict checks are; a small check-then-act race
// window here is an accepted, explicitly-documented tradeoff (same class
// of "friendly pre-check, not the non-negotiable guarantee" already used
// for the walk-in flow's match-day check) — the real, non-negotiable
// guarantee stays the EXCLUDE constraints for actual double-booking. An
// OPEN proposal's own booking row already holds live slot rows, so it's
// counted here too, automatically — no separate accounting needed.
async function assertBookingLimits({ teamId, playerIds }) {
  if (teamId != null) {
    const count = await engineRepo.countActiveBookingsForTeam(teamId)
    if (count >= MAX_ACTIVE_BOOKINGS_PER_TEAM) {
      throw new BookingError(BOOKING_ERROR_CODES.BOOKING_LIMIT_REACHED, `This team already has ${MAX_ACTIVE_BOOKINGS_PER_TEAM} active bookings, the maximum allowed.`)
    }
  }
  for (const playerId of playerIds) {
    const count = await engineRepo.countActiveBookingsForPlayer(playerId)
    if (count >= MAX_ACTIVE_BOOKINGS_PER_PLAYER) {
      throw new BookingError(BOOKING_ERROR_CODES.BOOKING_LIMIT_REACHED, `Player ${playerId} already has ${MAX_ACTIVE_BOOKINGS_PER_PLAYER} active bookings, the maximum allowed.`)
    }
  }
}

/** The atomic core: inserts a ground_bookings row plus (optionally) one
 * team's booking_teams/booking_team_slots row and every listed player's
 * booking_player_slots/booking_participants rows, all in the caller's
 * transaction. Any EXCLUDE-constraint violation (ground, team, or player
 * axis) is translated to the specific BookingError before rethrowing — the
 * caller only needs to BEGIN/COMMIT/ROLLBACK around this call. Shared by
 * createTeamBooking (status CONFIRMED, no proposal) and
 * matchProposal.service.js (status PROPOSED then later a second team
 * attached on acceptance) — the single place either kind of booking is
 * actually written, so the conflict-checking logic itself is never
 * duplicated between the two flows. */
async function insertBookingWithSlots(client, {
  groundId, publicBookingId, actingUserId, customerName, startTime, endTime,
  purpose = null, notes = null, clientActionId = null, bookingPurpose, matchFormat = null, status,
  teamId = null, teamRole = null, playerIds, proposalId = null, holdExpiresAt = null,
}) {
  let conflictingPlayerId = null
  try {
    const booking = await bookingRepo.insertBooking(client, {
      groundId,
      publicBookingId,
      bookingType: 'CUSTOMER',
      userId: actingUserId,
      customerName,
      startTime,
      endTime,
      purpose,
      notes,
      clientActionId,
      bookingPurpose,
      matchFormat,
      status,
      proposalId,
      holdExpiresAt,
    })
    if (teamId != null) {
      await engineRepo.insertBookingTeam(client, { bookingId: booking.id, teamId, role: teamRole })
      await engineRepo.insertTeamSlot(client, { bookingId: booking.id, teamId, startTime, endTime })
    }
    for (const playerId of playerIds) {
      conflictingPlayerId = playerId
      await engineRepo.insertPlayerSlot(client, { bookingId: booking.id, playerId, startTime, endTime })
      await engineRepo.upsertParticipant(client, { bookingId: booking.id, playerId })
    }
    return booking
  } catch (err) {
    if (err.code === '23P01') {
      const translated = translateExclusionViolation(err, { conflictingPlayerId })
      if (translated) throw translated
    }
    throw err
  }
}

/**
 * Creates a direct (non-proposal) MATCH or PRACTICE booking: one team
 * (MATCH requires it; PRACTICE allows none, for individual/friends play)
 * plus its participant list. Goes straight to CONFIRMED — the ground/team/
 * player EXCLUDE constraints, all inserted in one transaction alongside the
 * parent row, are the actual non-negotiable guarantee (§15), the same
 * pattern the walk-in flow's createBooking already uses for the ground
 * axis alone. A real two-team match (a registered opponent, not just a
 * label) can only ever be committed through match-proposal acceptance —
 * this function never lets one team silently commit another team's slot
 * without that team explicitly accepting.
 */
export async function createTeamBooking({
  ground, actingUserId, bookingPurpose, matchFormat = null, startTime, endTime,
  teamId = null, participantPlayerIds, purpose = null, notes = null, clientActionId = null,
}) {
  if (!['MATCH', 'PRACTICE'].includes(bookingPurpose)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'bookingPurpose must be MATCH or PRACTICE.')
  }
  if (ground.status !== 'ACTIVE') {
    throw new BookingError(BOOKING_ERROR_CODES.GROUND_CLOSED, 'This ground is not currently accepting bookings.')
  }
  if (bookingPurpose === 'MATCH' && teamId == null) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A match booking requires a team.')
  }

  validateBookingTimeRange({ startTime, endTime, ground })

  const actingPlayer = await resolveActingPlayer(actingUserId)
  let team = null
  if (teamId != null) team = await assertTeamAuthority(actingPlayer, teamId)

  const playerIds = normalizeParticipantIds(participantPlayerIds)
  const foundPlayers = await findPlayersByIds(playerIds)
  assertPlayersExist(playerIds, foundPlayers)

  if (clientActionId) {
    const existing = await bookingRepo.findByClientActionId(clientActionId)
    if (existing) return { booking: existing, idempotentReplay: true }
  }

  await assertBookingLimits({ teamId, playerIds })

  const client = await pool.connect()
  let booking
  try {
    await client.query('BEGIN')
    // §6 — a stale expired PROPOSED/HOLD row at this ground must never
    // permanently block a new booking just because nothing has swept it
    // yet (Postgres's EXCLUDE constraint can't itself expire on a clock).
    await engineRepo.sweepExpiredHolds(client, ground.id)
    booking = await insertBookingWithSlots(client, {
      groundId: ground.id,
      publicBookingId: generatePublicId('LOC', 6),
      actingUserId,
      customerName: team ? team.name : actingPlayer.name,
      startTime,
      endTime,
      purpose,
      notes,
      clientActionId,
      bookingPurpose,
      matchFormat,
      status: 'CONFIRMED',
      teamId,
      playerIds,
    })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: booking.id, action: 'CREATED', actorUserId: actingUserId, newValue: booking })

  for (const playerId of playerIds) {
    const player = foundPlayers.find((p) => p.id === playerId)
    if (player?.user_id) {
      await notificationService.createNotification({
        userId: player.user_id,
        type: 'BOOKING_APPROVED',
        title: bookingPurpose === 'MATCH' ? 'Match booking confirmed' : 'Practice booking confirmed',
        body: `You've been added to a ${bookingPurpose.toLowerCase()} booking (${booking.public_booking_id}).`,
        relatedBookingId: booking.id,
      })
    }
  }

  return { booking, idempotentReplay: false }
}

async function transitionStatus(client, booking, toStatus, extra = {}) {
  if (!isValidStatusTransition(booking.status, toStatus)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_STATUS_TRANSITION, `Cannot move a booking from ${booking.status} to ${toStatus}.`)
  }
  const updated = await bookingRepo.updateBookingStatus(client, booking.id, booking.status, toStatus, extra)
  if (!updated) {
    // The WHERE status = fromStatus predicate matched 0 rows — someone else
    // already transitioned this exact booking between our read and this
    // write. Same concurrency posture as the EXCLUDE constraint: the loser
    // gets a clean, specific error, never a silently-lost update.
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_STATUS_TRANSITION, 'This booking was already updated by someone else — refresh and try again.')
  }
  if (!isBlockingStatus(toStatus)) {
    await engineRepo.deleteSlotsForBooking(client, booking.id)
  }
  return updated
}

async function assertCanActOnBooking(booking, { actingUserId, isStaff }) {
  if (isStaff) return
  if (booking.user_id === actingUserId) return
  const actingPlayer = await resolveActingPlayer(actingUserId)
  const teams = await engineRepo.findTeamsForBooking(booking.id)
  if (teams.some((t) => t.team_id === actingPlayer.team_id)) return
  throw new BookingError(BOOKING_ERROR_CODES.FORBIDDEN, 'You are not authorized to act on this booking.')
}

/** Loads a MATCH/PRACTICE booking by its public id — never a WALK_IN row,
 * which stays entirely owned by groundBooking.service.js's own lifecycle
 * (§34 — ownership boundaries are explicit, not "whichever service gets
 * there first"). Same 404 either way a caller can't tell "wrong purpose"
 * from "doesn't exist" (§35 — no existence leak via error-shape difference).
 *
 * `groundId`, when passed, enforces the tenancy check every ground-scoped
 * staff route needs: `requireGroundPermission` on the route only proves the
 * actor is authorized STAFF AT THE GROUND NAMED IN THE URL — it says
 * nothing about whether the :publicBookingId in the same URL actually
 * belongs to that ground. Without this, a Ground A admin could act on a
 * Ground B booking just by knowing its id. Same 404-either-way treatment as
 * the booking-purpose check above, matching groundAccess.js's own
 * "wrong ground" == "not found" convention (attachGroundCanteenContext). */
async function findTeamBookingByPublicId(publicBookingId, { groundId = null } = {}) {
  const booking = await bookingRepo.findByPublicId(publicBookingId)
  if (!booking || booking.booking_purpose === 'WALK_IN' || (groundId != null && booking.ground_id !== groundId)) {
    throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.')
  }
  return booking
}

export async function cancelTeamBooking(publicBookingId, { actingUserId, isStaff = false, groundId = null, reason = null }) {
  const booking = await findTeamBookingByPublicId(publicBookingId, { groundId: isStaff ? groundId : null })
  await assertCanActOnBooking(booking, { actingUserId, isStaff })

  const client = await pool.connect()
  let updated
  try {
    await client.query('BEGIN')
    updated = await transitionStatus(client, booking, 'CANCELLED', { cancelled_at: new Date(), cancelled_by: actingUserId, cancellation_reason: reason })
    // §19 — a proposal-originated booking (PROPOSED, still open, or already
    // CONFIRMED into a real two-team match) must never leave match_proposals
    // pointing at a status that no longer matches reality. Cancelling here
    // is a deliberate CONFIRMED -> CANCELLED (or OPEN's booking ->
    // CANCELLED) action, never a silent reopen back to OPEN — §19 forbids
    // that unless it's its own deliberate feature, which this isn't.
    if (booking.proposal_id != null) {
      await proposalRepo.updateProposalStatus(client, booking.proposal_id, 'CONFIRMED', 'CANCELLED', {})
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: booking.id, action: 'CANCELLED', actorUserId: actingUserId, previousValue: booking, newValue: updated })
  const participants = await engineRepo.findParticipantsForBooking(booking.id)
  for (const p of participants) {
    if (!p.user_id) continue
    await notificationService.createNotification({
      userId: p.user_id,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      body: `A booking you were part of (${booking.public_booking_id}) has been cancelled.`,
      relatedBookingId: booking.id,
    })
  }
  return updated
}

/** Staff/ground-scoped: marks a CONFIRMED booking's participants as having
 * shown up. Not a status transition (CONFIRMED stays CONFIRMED) — just a
 * timestamp, matching §24's "support attendance/check-in where
 * appropriate" without inventing a whole new blocking status for it. */
export async function checkInBooking(publicBookingId, { actingStaffId, groundId }) {
  const booking = await findTeamBookingByPublicId(publicBookingId, { groundId })
  if (booking.status !== 'CONFIRMED') {
    throw new BookingError(BOOKING_ERROR_CODES.NOT_CONFIRMED, 'Only a confirmed booking can be checked in.')
  }
  if (booking.checked_in_at) {
    throw new BookingError(BOOKING_ERROR_CODES.ALREADY_CHECKED_IN, 'This booking is already checked in.')
  }
  const updated = await bookingRepo.markCheckedIn(booking.id)
  if (!updated) throw new BookingError(BOOKING_ERROR_CODES.ALREADY_CHECKED_IN, 'This booking is already checked in.')
  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: booking.id, action: 'CHECKED_IN', actorUserId: actingStaffId, newValue: updated })
  return updated
}

/** Staff/ground-scoped: records that nobody showed up for a CONFIRMED
 * booking whose slot has already passed. Terminal — releases the slot like
 * any other non-blocking transition. */
export async function recordNoShow(publicBookingId, { actingStaffId, groundId, io = null }) {
  const booking = await findTeamBookingByPublicId(publicBookingId, { groundId })
  if (booking.status !== 'CONFIRMED') {
    throw new BookingError(BOOKING_ERROR_CODES.NOT_CONFIRMED, 'Only a confirmed booking can be marked as a no-show.')
  }

  const client = await pool.connect()
  let updated
  try {
    await client.query('BEGIN')
    updated = await transitionStatus(client, booking, 'NO_SHOW', { no_show_at: new Date() })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  await auditLogService.logEvent({ entityType: 'BOOKING', entityId: booking.id, action: 'NO_SHOW', actorUserId: actingStaffId, previousValue: booking, newValue: updated })
  logger.warn('Booking marked as no-show', { publicBookingId, bookingId: booking.id })

  // Phase 15 — Ground Owner notification for this booking status change.
  const ownerUserIds = await findActiveGroundOwnerUserIds(groundId)
  await Promise.all(
    ownerUserIds.map((ownerUserId) =>
      notificationService.createNotification({
        userId: ownerUserId,
        type: 'GROUND_BOOKING_STATUS_CHANGED',
        title: 'Booking marked as no-show',
        body: `Booking ${publicBookingId} was recorded as a no-show.`,
        relatedBookingId: booking.id,
        groundId,
        io,
      }),
    ),
  )

  return updated
}

// §35 — booking id security. Knowing a valid publicBookingId is never
// sufficient on its own: the requester must be the booking's own account,
// a member of one of its teams, or ground staff with BOOKING_VIEW/
// BOOKING_MANAGE (GROUND_OWNER gets implicit access, matching every other
// ground-scoped resource in this app).
async function assertCanViewBooking(booking, user) {
  if (isSuperAdminUser(user)) return
  if (booking.user_id === user.id) return
  const [teams, player] = await Promise.all([engineRepo.findTeamsForBooking(booking.id), findPlayerByUserId(user.id)])
  if (player && teams.some((t) => t.team_id === player.team_id)) return
  const membership = await findActiveMembershipForAnyRole(user.id, booking.ground_id, ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF'])
  if (membership) {
    if (membership.role === 'GROUND_OWNER') return
    if ((await hasActivePermission(membership.id, 'BOOKING_VIEW')) || (await hasActivePermission(membership.id, 'BOOKING_MANAGE'))) return
  }
  throw new BookingError(BOOKING_ERROR_CODES.FORBIDDEN, 'You are not authorized to view this booking.')
}

export async function findTeamBookingDetail(publicBookingId, user) {
  const booking = await findTeamBookingByPublicId(publicBookingId)
  await assertCanViewBooking(booking, user)
  const [teams, participants] = await Promise.all([
    engineRepo.findTeamsForBooking(booking.id),
    engineRepo.findParticipantsForBooking(booking.id),
  ])
  return { booking, teams, participants }
}

// Phase 25 reuse surface — see the file-header comment. Not part of the
// HTTP-facing API of this module.
export const internal = {
  insertBookingWithSlots,
  resolveActingPlayer,
  assertTeamAuthority,
  assertBookingLimits,
  translateExclusionViolation,
  transitionStatus,
  assertCanActOnBooking,
  assertCanViewBooking,
  findTeamBookingByPublicId,
}
