import * as bookingService from '../services/groundBooking.service.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'
import { utcToGroundLocalParts } from '../domain/booking/timezone.js'
import { deriveDisplayStatus } from '../domain/booking/bookingStatus.js'
import * as groundReportService from '../services/groundReport.service.js'
import { findPublicActiveGroundByPublicId } from '../models/ground.model.js'

// Phase 14 Part 3 — thin HTTP glue only, same convention as every other
// controller in this codebase (scoring.controller.js, team.controller.js) —
// orchestration lives in the service, SQL lives in the repository.

// A client can send either the exact `startTime` instant it was just shown
// by GET /availability (the robust path — no client-side timezone math to
// get wrong, it just echoes back what the server already told it), or a
// plain `{date, hour, minute}` shape (used by the simpler staff-block form).
// Either way, ground-local date/hour/minute is what the service needs, and
// this is the ONE place that derives it, never duplicated on the frontend.
function resolveSlotInput(body) {
  if (body.startTime) {
    const parts = utcToGroundLocalParts(new Date(body.startTime))
    return { dateStr: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`, hour: parts.hour, minute: parts.minute }
  }
  return { dateStr: String(body.date || ''), hour: Number(body.hour), minute: body.minute != null ? Number(body.minute) : 0 }
}

function serializeBooking(row) {
  return {
    publicBookingId: row.public_booking_id,
    bookingType: row.booking_type,
    blockType: row.block_type,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    displayStatus: deriveDisplayStatus(row),
    purpose: row.purpose,
    expectedPlayers: row.expected_players,
    notes: row.notes,
    // Ground Pricing UX Polish — the server-computed, immutable price
    // snapshot taken at booking-creation time (never recalculated later).
    // null only for a STAFF_BLOCK (never priced) — a CUSTOMER booking always
    // has one now that PRICE_UNAVAILABLE blocks creation without it.
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : null,
    googleSyncStatus: row.google_sync_status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    // Contact details are the booking owner's own private data — fine to
    // return to them/staff, but this serializer must never be reused for a
    // public/other-user-facing response.
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    customerName: row.customer_name,
    // Priority 4 — which ground this booking is for. Only present on rows
    // that came through listByUser's LEFT JOIN (My Bookings); create/cancel/
    // staff-schedule responses select ground_bookings alone, so this stays
    // undefined there rather than a fabricated null object. Public-safe:
    // publicGroundId + name + city are the same fields the ground card and
    // ground discovery already expose to anyone.
    ...(row.ground_public_id
      ? { ground: { publicGroundId: row.ground_public_id, name: row.ground_name, city: row.ground_city } }
      : {}),
  }
}

// Ground Time-Slot Pricing — this legacy walk-in path predates ground_id on
// bookings (Phase 6 added optional groundId support to the service layer,
// but no caller here ever passed it, so every request silently booked the
// platform's single default ground regardless of which ground's page the
// customer was on). An optional publicGroundId now resolves to a real,
// ACTIVE ground via the exact same lookup the public ground profile route
// already uses (findPublicActiveGroundByPublicId) — never a raw internal id
// trusted from the client. Omitted, this falls back to the identical
// default-ground behavior every existing caller already relies on.
async function resolveOptionalGroundId(publicGroundId) {
  if (!publicGroundId) return null
  const ground = await findPublicActiveGroundByPublicId(String(publicGroundId))
  if (!ground) throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'Ground not found.')
  return ground.id
}

export async function getAvailability(req, res, next) {
  try {
    const dateStr = String(req.query.date || '')
    const isStaff = req.user?.role === 'staff'
    const groundId = await resolveOptionalGroundId(req.query.publicGroundId)
    const slots = await bookingService.getDayAvailability(dateStr, { isStaff, groundId })
    res.json({ date: dateStr, slots })
  } catch (err) {
    next(err)
  }
}

export async function createBooking(req, res, next) {
  try {
    const { purpose, expectedPlayers, notes, contactPhone, contactEmail, clientActionId, publicGroundId } = req.body
    const { dateStr, hour, minute } = resolveSlotInput(req.body)
    const groundId = await resolveOptionalGroundId(publicGroundId)
    const { booking, idempotentReplay } = await bookingService.createBooking({
      dateStr,
      hour,
      minute,
      userId: req.user.id,
      customerName: req.user.name,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || req.user.email || null,
      purpose: purpose || null,
      expectedPlayers: expectedPlayers != null ? Number(expectedPlayers) : null,
      notes: notes || null,
      clientActionId: clientActionId || null,
      groundId,
      io: req.io,
    })
    if (!idempotentReplay) bookingService.notifyBookingDateChanged(req.io, dateStr)
    res.status(201).json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}

export async function listMyBookings(req, res, next) {
  try {
    const bookings = await bookingService.listMyBookings(req.user.id)
    res.json({ bookings: bookings.map(serializeBooking) })
  } catch (err) {
    next(err)
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const isStaff = req.user.role === 'staff'
    const booking = await bookingService.cancelBooking(req.params.publicBookingId, { actingUserId: req.user.id, isStaff, io: req.io })
    bookingService.notifyBookingDateChanged(req.io, new Date(booking.start_time).toISOString().slice(0, 10))
    res.json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}

export async function getStaffSchedule(req, res, next) {
  try {
    const { from, to } = req.query
    const bookings = await bookingService.listStaffSchedule({ fromDate: from || undefined, toDate: to || undefined })
    res.json({ bookings: bookings.map(serializeBooking) })
  } catch (err) {
    next(err)
  }
}

export async function createStaffBlock(req, res, next) {
  try {
    const { purpose, blockType } = req.body
    const { dateStr, hour, minute } = resolveSlotInput(req.body)
    const { booking } = await bookingService.createStaffBlock({
      dateStr,
      hour,
      minute,
      purpose: purpose || 'Ground Block',
      blockType: blockType || null,
      createdByStaffId: req.user.id,
    })
    bookingService.notifyBookingDateChanged(req.io, dateStr)
    res.status(201).json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}

export async function getBookingHistory(req, res, next) {
  try {
    const { q, status, bookingType, from, to, limit, offset } = req.query
    const result = await groundReportService.searchBookingHistory({
      q: q || undefined,
      status: status || undefined,
      bookingType: bookingType || undefined,
      fromDate: from || undefined,
      toDate: to || undefined,
      limit: limit != null ? Number(limit) : undefined,
      offset: offset != null ? Number(offset) : undefined,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function removeStaffBlock(req, res, next) {
  try {
    const existing = await bookingService.findBookingByPublicId(req.params.publicBookingId)
    if (!existing || existing.booking_type !== 'STAFF_BLOCK') {
      throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'That reference is not a staff block.')
    }
    const booking = await bookingService.cancelBooking(req.params.publicBookingId, { actingUserId: req.user.id, isStaff: true })
    bookingService.notifyBookingDateChanged(req.io, new Date(booking.start_time).toISOString().slice(0, 10))
    res.json({ booking: serializeBooking(booking) })
  } catch (err) {
    next(err)
  }
}
