import * as bookingService from '../services/groundBooking.service.js'
import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'

// Phase 6 — thin HTTP glue wrapping existing groundBooking.service functions.
// Ground context is already resolved + authorized by middleware (attachGroundContext +
// requireGroundPermission), so req.ground.id is trusted. Reuses all existing logic:
// availability computation, conflict detection, timezone handling, etc.

function serializeBooking(row) {
  return {
    publicBookingId: row.public_booking_id,
    bookingType: row.booking_type,
    blockType: row.block_type,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    purpose: row.purpose,
    expectedPlayers: row.expected_players,
    notes: row.notes,
    customerName: row.customer_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    checkedInAt: row.checked_in_at,
    noShowAt: row.no_show_at,
  }
}

// GET /ground-owner/grounds/:publicGroundId/bookings/availability
// Returns available slots for a specific date at this ground (no auth required).
export async function getGroundAvailability(req, res, next) {
  try {
    const dateStr = String(req.query.date || '')
    const slots = await bookingService.getDayAvailability(dateStr, { isStaff: true, groundId: req.ground.id })
    res.json({ date: dateStr, slots })
  } catch (err) {
    next(err)
  }
}

// GET /ground-owner/grounds/:publicGroundId/bookings
// List all bookings for this ground, scoped by req.ground.id.
export async function listGroundBookings(req, res, next) {
  try {
    const { fromDate, toDate, status } = req.query
    const bookings = await bookingRepo.listGroundBookingsInRange({
      groundId: req.ground.id,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      status: status || undefined,
    })
    res.json({ bookings: bookings.map(serializeBooking) })
  } catch (err) {
    next(err)
  }
}

// GET /ground-owner/grounds/:publicGroundId/bookings/:publicBookingId
// Get a single booking, verifying it belongs to this ground.
export async function getGroundBooking(req, res, next) {
  try {
    const booking = await bookingRepo.findByPublicId(req.params.publicBookingId)
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    if (booking.ground_id !== req.ground.id) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    res.json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}

// PATCH /ground-owner/grounds/:publicGroundId/bookings/:publicBookingId/status
// Update booking status (check-in, no-show, cancel), with ground ownership verification.
export async function updateGroundBookingStatus(req, res, next) {
  try {
    const { status } = req.body
    if (!status) {
      return res.status(400).json({ error: 'Status is required.' })
    }

    const booking = await bookingRepo.findByPublicId(req.params.publicBookingId)
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    if (booking.ground_id !== req.ground.id) {
      return res.status(404).json({ error: 'Booking not found.' })
    }

    // For now, only staff blocks can be transitioned to CANCELLED by owner.
    // Customer bookings use the normal cancelBooking flow.
    // No-show/checked-in are marked via separate endpoints in a full implementation.
    if (status === 'CANCELLED' && booking.booking_type === 'STAFF_BLOCK') {
      const updated = await bookingService.cancelBooking(req.params.publicBookingId, { actingUserId: req.user.id, isStaff: true })
      return res.json({ booking: serializeBooking(updated) })
    }

    return res.status(400).json({ error: 'Invalid status transition.' })
  } catch (err) {
    next(err)
  }
}

// POST /ground-owner/grounds/:publicGroundId/bookings/staff-blocks
// Create a staff block (ground owner only).
export async function createGroundStaffBlock(req, res, next) {
  try {
    const { date, hour, minute, purpose, blockType } = req.body
    const { booking } = await bookingService.createStaffBlock({
      groundId: req.ground.id,
      dateStr: String(date),
      hour: Number(hour),
      minute: minute != null ? Number(minute) : 0,
      purpose: purpose || 'Ground Block',
      blockType: blockType || null,
      createdByStaffId: req.user.id,
    })
    bookingService.notifyBookingDateChanged(req.io, String(date))
    res.status(201).json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}

// DELETE /ground-owner/grounds/:publicGroundId/bookings/staff-blocks/:publicBlockId
// Remove a staff block (ground owner only).
export async function removeGroundStaffBlock(req, res, next) {
  try {
    const booking = await bookingService.findBookingByPublicId(req.params.publicBlockId)
    if (!booking) {
      return res.status(404).json({ error: 'Block not found.' })
    }
    if (booking.ground_id !== req.ground.id) {
      return res.status(404).json({ error: 'Block not found.' })
    }
    if (booking.booking_type !== 'STAFF_BLOCK') {
      return res.status(400).json({ error: 'Only staff blocks can be removed this way.' })
    }

    const updated = await bookingService.cancelBooking(req.params.publicBlockId, { actingUserId: req.user.id, isStaff: true })
    bookingService.notifyBookingDateChanged(req.io, new Date(updated.start_time).toISOString().slice(0, 10))
    res.json({ booking: serializeBooking(updated) })
  } catch (err) {
    next(err)
  }
}
