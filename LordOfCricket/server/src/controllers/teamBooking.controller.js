import * as engine from '../services/bookingConflict.service.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'
import { deriveDisplayStatus } from '../domain/booking/bookingStatus.js'

// Phase 24 — thin HTTP glue for MATCH/PRACTICE bookings, same convention as
// groundBooking.controller.js: orchestration lives in bookingConflict.
// service.js, SQL lives in the repositories.

function serializeBooking(booking, { teams = [], participants = [] } = {}) {
  return {
    publicBookingId: booking.public_booking_id,
    bookingPurpose: booking.booking_purpose,
    matchFormat: booking.match_format,
    startTime: booking.start_time,
    endTime: booking.end_time,
    status: booking.status,
    displayStatus: deriveDisplayStatus(booking),
    purpose: booking.purpose,
    notes: booking.notes,
    checkedInAt: booking.checked_in_at,
    noShowAt: booking.no_show_at,
    cancelledAt: booking.cancelled_at,
    cancellationReason: booking.cancellation_reason,
    createdAt: booking.created_at,
    teams: teams.map((t) => ({ teamId: t.team_id, teamName: t.team_name, role: t.role })),
    participants: participants.map((p) => ({ playerId: p.player_id, playerName: p.player_name, publicPlayerId: p.public_player_id })),
  }
}

export async function createTeamBooking(req, res, next) {
  try {
    const { bookingPurpose, matchFormat, startTime, endTime, teamId, participantPlayerIds, purpose, notes, clientActionId } = req.body
    const { booking, idempotentReplay } = await engine.createTeamBooking({
      ground: req.ground,
      actingUserId: req.user.id,
      bookingPurpose,
      matchFormat: matchFormat || null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      teamId: teamId != null ? Number(teamId) : null,
      participantPlayerIds: participantPlayerIds || [],
      purpose: purpose || null,
      notes: notes || null,
      clientActionId: clientActionId || null,
    })
    const detail = await engine.findTeamBookingDetail(booking.public_booking_id, req.user)
    res.status(idempotentReplay ? 200 : 201).json({ booking: serializeBooking(detail.booking, detail) })
  } catch (err) {
    next(err)
  }
}

async function assertBookingBelongsToUrlGround(booking, req) {
  if (booking.ground_id !== req.ground.id) {
    throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.')
  }
}

export async function getTeamBooking(req, res, next) {
  try {
    const detail = await engine.findTeamBookingDetail(req.params.publicBookingId, req.user)
    await assertBookingBelongsToUrlGround(detail.booking, req)
    res.json({ booking: serializeBooking(detail.booking, detail) })
  } catch (err) {
    next(err)
  }
}

export async function cancelTeamBooking(req, res, next) {
  try {
    const updated = await engine.cancelTeamBooking(req.params.publicBookingId, {
      actingUserId: req.user.id,
      isStaff: false,
      reason: req.body?.reason || null,
    })
    const detail = await engine.findTeamBookingDetail(updated.public_booking_id, req.user)
    res.json({ booking: serializeBooking(detail.booking, detail) })
  } catch (err) {
    next(err)
  }
}

export async function staffCancelTeamBooking(req, res, next) {
  try {
    const updated = await engine.cancelTeamBooking(req.params.publicBookingId, {
      actingUserId: req.user.id,
      isStaff: true,
      groundId: req.ground.id,
      reason: req.body?.reason || null,
    })
    const detail = await engine.findTeamBookingDetail(updated.public_booking_id, req.user)
    res.json({ booking: serializeBooking(detail.booking, detail) })
  } catch (err) {
    next(err)
  }
}

export async function checkInTeamBooking(req, res, next) {
  try {
    const updated = await engine.checkInBooking(req.params.publicBookingId, { actingStaffId: req.user.id, groundId: req.ground.id })
    res.json({ booking: serializeBooking(updated) })
  } catch (err) {
    next(err)
  }
}

export async function recordTeamBookingNoShow(req, res, next) {
  try {
    const updated = await engine.recordNoShow(req.params.publicBookingId, { actingStaffId: req.user.id, groundId: req.ground.id, io: req.io })
    res.json({ booking: serializeBooking(updated) })
  } catch (err) {
    next(err)
  }
}

export async function listTeamBookings(req, res, next) {
  try {
    const { db } = req.app.locals
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const player = await db.query(
      'SELECT team_id FROM players WHERE user_id = $1',
      [req.user.id]
    )

    if (player.rows.length === 0) {
      return res.json({ bookings: [] })
    }

    const teamId = player.rows[0].team_id
    if (!teamId) {
      return res.json({ bookings: [] })
    }

    const bookings = await db.query(
      `SELECT g.public_ground_id, g.name as ground_name, gb.*
       FROM ground_bookings gb
       JOIN booking_teams bt ON gb.id = bt.booking_id
       JOIN grounds g ON gb.ground_id = g.id
       WHERE bt.team_id = $1
       ORDER BY gb.start_time DESC`,
      [teamId]
    )

    const serialized = bookings.rows.map(row => ({
      public_booking_id: row.public_booking_id,
      public_ground_id: row.public_ground_id,
      ground_name: row.ground_name,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      booking_purpose: row.booking_purpose,
    }))

    res.json({ bookings: serialized })
  } catch (err) {
    next(err)
  }
}
