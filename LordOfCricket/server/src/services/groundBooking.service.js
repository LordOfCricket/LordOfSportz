import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'
import { findDefaultGround, findGroundById } from '../models/ground.model.js'
import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { computeDayAvailability } from '../domain/booking/availability.js'
import { findNearbyAlternatives } from '../domain/booking/recommendations.js'
import { groundLocalToUtc, utcToGroundLocalParts, isValidDateStr, groundTodayDateStr, addDaysToDateStr } from '../domain/booking/timezone.js'
import { SLOT_DURATION_MINUTES, MAX_BOOKING_HORIZON_DAYS, GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR } from '../domain/booking/policy.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'
import { isValidBlockType } from '../domain/booking/blockTypes.js'
import { computeApplicablePrice, listActivePricingSlots } from './groundPricing.service.js'
import { findSlotContainingTime, timeToMinutes } from '../domain/groundPricing/pricing.js'
import * as googleCalendar from './googleCalendar.service.js'
import * as auditLogService from './groundAuditLog.service.js'
import * as notificationService from './groundNotification.service.js'
import { publishBookingUpdate } from '../realtime/bookingRealtime.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { logger } from '../utils/logger.js'

// Phase 14 Part 3 — orchestration. PostgreSQL is authoritative throughout;
// Google Calendar sync only ever runs AFTER a booking row has already
// committed (Part 13/29/31), and its result never changes the booking's own
// success/failure. This mirrors scoring.service.js's shape: domain layer for
// pure rules, repository for SQL, this file for the transaction + external
// side effects.

function assertBookableDate(dateStr) {
  if (!isValidDateStr(dateStr)) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, 'A valid date (YYYY-MM-DD) is required.')
  const today = groundTodayDateStr()
  if (dateStr < today) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, 'Cannot view availability for a past date.')
  const maxDate = addDaysToDateStr(today, MAX_BOOKING_HORIZON_DAYS)
  if (dateStr > maxDate) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, `Bookings are only open up to ${MAX_BOOKING_HORIZON_DAYS} days ahead.`)
}

/** Phase 24 — the walk-in flow has no :publicGroundId in its URL (Part 51:
 * preserve the existing API) and never did before ground_id existed on
 * ground_bookings at all. findDefaultGround() (not findSingleGround())
 * deterministically resolves the platform's original ground even when other
 * grounds exist (real registrations, or accumulated test-fixture grounds in
 * this dev database) — see its own doc comment in ground.model.js. */
async function resolveDefaultGroundId() {
  const ground = await findDefaultGround()
  if (!ground) throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'No ground is configured yet.')
  return ground.id
}

/** Builds the flat `{startTime, endTime, reason}` occupancy list a single
 * day's availability is computed against: confirmed bookings/staff blocks
 * (real ranges) + LOC match days (whole-day, Part 37). */
async function buildOccupiedRanges(dateStr, groundId) {
  const dayStart = groundLocalToUtc(dateStr, 0, 0)
  const dayEnd = groundLocalToUtc(dateStr, 24, 0)

  const [confirmed, matchDates] = await Promise.all([
    bookingRepo.listConfirmedInRange(dayStart, dayEnd, groundId),
    bookingRepo.listMatchDatesInRange(dateStr, addDaysToDateStr(dateStr, 1)),
  ])

  const ranges = confirmed.map((row) => ({
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    reason: row.booking_type === 'STAFF_BLOCK' ? 'BLOCKED' : 'BOOKED',
  }))

  if (matchDates.includes(dateStr)) {
    // A whole-day block, not a fabricated time range (see repository comment).
    ranges.push({ startTime: groundLocalToUtc(dateStr, GROUND_OPENING_HOUR, 0), endTime: groundLocalToUtc(dateStr, GROUND_CLOSING_HOUR, 0), reason: 'MATCH' })
  }

  return ranges
}

/** @param opts.isStaff — staff sees the specific reason (BOOKED/BLOCKED/MATCH/PAST);
 * the public view only ever sees AVAILABLE/UNAVAILABLE (Part 47 — "Unavailable is often enough").
 * @param opts.groundId — Phase 6: optional ground ID for multi-ground operations. If not provided,
 * resolves to the default ground (backward compatible with Phase 14 single-ground flow). */
export async function getDayAvailability(dateStr, { isStaff = false, groundId: paramGroundId = null } = {}) {
  assertBookableDate(dateStr)
  const groundId = paramGroundId || await resolveDefaultGroundId()
  const [occupied, activePricingSlots] = await Promise.all([buildOccupiedRanges(dateStr, groundId), listActivePricingSlots(groundId)])
  const slots = computeDayAvailability(dateStr, occupied)
  // Ground Pricing UX Polish — same lookup createBooking uses at
  // confirmation time (findSlotContainingTime), just fetched once for the
  // whole day instead of per-slot, so the customer can see the price before
  // picking a time rather than discovering PRICE_UNAVAILABLE only on submit.
  // null means "no active slot covers this time" — an honest absence, not a
  // fabricated ₹0, same convention as computeApplicablePrice itself.
  return slots.map((s) => {
    const localParts = utcToGroundLocalParts(s.startTime)
    const timeOfDayMinutes = timeToMinutes(`${String(localParts.hour).padStart(2, '0')}:${String(localParts.minute).padStart(2, '0')}`)
    const priceSlot = findSlotContainingTime(activePricingSlots, timeOfDayMinutes)
    return {
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      status: s.status,
      reason: isStaff ? s.reason : null,
      price: priceSlot ? Number(priceSlot.price) : null,
    }
  })
}

function availabilityLookupFactory(cache) {
  return (dateStr) => cache.get(dateStr) || []
}

async function buildRecommendations(dateStr, hour, minute) {
  // Bounded pre-fetch: the requested day plus a short lookahead window,
  // matching recommendations.js's own default maxDaysAhead.
  const maxDaysAhead = 7
  const groundId = await resolveDefaultGroundId()
  const cache = new Map()
  const dates = [dateStr, ...Array.from({ length: maxDaysAhead }, (_, i) => addDaysToDateStr(dateStr, i + 1))]
  for (const d of dates) {
    if (d > addDaysToDateStr(groundTodayDateStr(), MAX_BOOKING_HORIZON_DAYS)) continue
    const occupied = await buildOccupiedRanges(d, groundId)
    cache.set(d, computeDayAvailability(d, occupied))
  }
  const alternatives = findNearbyAlternatives(dateStr, hour, minute, availabilityLookupFactory(cache), { maxDaysAhead })
  return alternatives.map((a) => ({ startTime: a.startTime.toISOString(), endTime: a.endTime.toISOString() }))
}

function validateSlotAlignment(dateStr, hour, minute) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A valid start time is required.')
  }
  const startTime = groundLocalToUtc(dateStr, hour, minute)
  const dayStart = groundLocalToUtc(dateStr, GROUND_OPENING_HOUR, 0)
  const dayEnd = groundLocalToUtc(dateStr, GROUND_CLOSING_HOUR, 0)
  const offsetMinutes = (startTime.getTime() - dayStart.getTime()) / 60000
  if (startTime.getTime() < dayStart.getTime() || startTime.getTime() + SLOT_DURATION_MINUTES * 60000 > dayEnd.getTime() || offsetMinutes % SLOT_DURATION_MINUTES !== 0) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'That start time does not align with a valid booking slot.')
  }
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60000)
  if (startTime.getTime() < Date.now()) {
    throw new BookingError(BOOKING_ERROR_CODES.PAST_TIME, 'That time has already passed.')
  }
  return { startTime, endTime }
}

/**
 * Creates a CONFIRMED booking. The database EXCLUDE constraint
 * (ground_bookings_no_overlap) is the actual, non-negotiable concurrency
 * guarantee — this function's pre-checks (match-day, idempotency) are
 * friendly UX/fast-path only. A 23P01 exclusion-violation from the INSERT
 * itself is what proves correctness under real concurrent requests.
 */
export async function createBooking({ dateStr, hour, minute = 0, userId = null, customerName, contactPhone = null, contactEmail = null, purpose = null, expectedPlayers = null, notes = null, clientActionId = null, bookingType = 'CUSTOMER', createdByStaffId = null, blockType = null, groundId: paramGroundId = null, io = null }) {
  assertBookableDate(dateStr)
  const { startTime, endTime } = validateSlotAlignment(dateStr, hour, minute)
  if (!customerName || !String(customerName).trim()) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A customer/booking name is required.')
  }
  if (blockType != null && !isValidBlockType(blockType)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, `Unknown block type: ${blockType}`)
  }

  if (clientActionId) {
    const existing = await bookingRepo.findByClientActionId(clientActionId)
    if (existing) return { booking: existing, idempotentReplay: true }
  }

  // Phase 6: groundId can be passed explicitly by ground-owner operations,
  // otherwise resolve default (backward compatible with Phase 14 single-ground flow)
  const groundId = paramGroundId || await resolveDefaultGroundId()

  // Phase 17.2 — this walk-in/staff-block engine is the ONLY booking-
  // creation path that never re-verified the ground's own status
  // (bookingConflict.service.js's team/match engine already does this,
  // see its own GROUND_CLOSED check). findDefaultGround has no status
  // filter either, so this check applies uniformly whether groundId came
  // from an explicit ground-owner call or the platform default — a
  // suspended ground can never accept a new booking through ANY path,
  // and a Ground Owner cannot bypass their own ground's suspension by
  // using this endpoint instead of the team-booking one.
  const ground = await findGroundById(groundId)
  if (!ground || ground.status !== 'ACTIVE') {
    logger.warn('Booking rejected — ground is not ACTIVE', { groundId, groundStatus: ground?.status || 'NOT_FOUND', bookingType })
    throw new BookingError(BOOKING_ERROR_CODES.GROUND_CLOSED, 'This ground is not currently accepting bookings.')
  }

  // Match-day pre-check: a friendly, fast rejection before even attempting
  // the INSERT (matches are rarely created in the same instant as a booking
  // attempt, so this check-then-act window is not the guarantee the
  // "non-negotiable" requirement is about — that's the EXCLUDE constraint
  // below, which also protects customer-vs-customer and customer-vs-staff-
  // block races that genuinely do race in practice).
  const matchDates = await bookingRepo.listMatchDatesInRange(dateStr, addDaysToDateStr(dateStr, 1))
  if (matchDates.includes(dateStr)) {
    const alternatives = await buildRecommendations(dateStr, hour, minute)
    throw new BookingError(BOOKING_ERROR_CODES.BOOKING_CONFLICT, 'This time is unavailable — the ground has a scheduled match that day.', { alternatives })
  }

  // Ground Time-Slot Pricing — server-side, authoritative price snapshot.
  // Never trusts a frontend-supplied amount (none is even accepted here).
  // A STAFF_BLOCK isn't a paid customer booking, so it's never priced/gated.
  // Ground Pricing UX Polish — no active pricing slot covering this
  // time-of-day is now a hard rejection for a CUSTOMER booking (previously
  // proceeded silently with amount=null). The frontend already shows price
  // per slot from GET /availability above and disables unpriced slots, so a
  // real user hitting this is a race (owner deactivated the slot between
  // fetch and confirm) — this is the authoritative backstop either way.
  let amount = null
  let pricingSlotId = null
  if (bookingType === 'CUSTOMER') {
    const timeOfDay = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const applicable = await computeApplicablePrice(groundId, timeOfDay)
    if (!applicable) {
      throw new BookingError(BOOKING_ERROR_CODES.PRICE_UNAVAILABLE, 'Price unavailable for this time. Please select another time slot or contact the ground.')
    }
    amount = applicable.amount
    pricingSlotId = applicable.pricingSlotId
  }

  const client = await pool.connect()
  let booking
  try {
    await client.query('BEGIN')
    booking = await bookingRepo.insertBooking(client, {
      groundId,
      publicBookingId: generatePublicId('LOC', 6),
      bookingType,
      userId,
      customerName: String(customerName).trim(),
      contactPhone,
      contactEmail,
      startTime,
      endTime,
      purpose,
      expectedPlayers,
      notes,
      clientActionId,
      createdByStaffId,
      blockType,
      amount,
      pricingSlotId,
    })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23P01') {
      // THE non-negotiable guarantee firing: this request lost the race.
      logger.warn('Booking conflict — exclusion constraint rejected an overlapping slot', { dateStr, hour, minute, bookingType })
      const alternatives = await buildRecommendations(dateStr, hour, minute)
      throw new BookingError(BOOKING_ERROR_CODES.BOOKING_CONFLICT, 'This time was just booked or is unavailable.', { alternatives })
    }
    throw err
  } finally {
    client.release()
  }

  // Phase 18 Feature 16 — audit log, strictly AFTER commit (never allowed to
  // affect booking success — same "best-effort side effect" posture as
  // Google Calendar sync below). CREATED action, no previous value (a new row).
  const entityType = bookingType === 'STAFF_BLOCK' ? 'BLOCK' : 'BOOKING'
  await auditLogService.logEvent({ entityType, entityId: booking.id, action: 'CREATED', actorUserId: createdByStaffId || userId, newValue: booking })

  // Phase 18 Feature 17 — in-app "approved" notification. LOC has no manual
  // approval step (Phase 14: auto-confirm by design — see
  // domain/booking/bookingStatus.js), so CONFIRMED is the moment a real
  // approval notification is meaningful; never sent for a staff block (no
  // customer to notify).
  if (bookingType === 'CUSTOMER' && userId) {
    await notificationService.createNotification({
      userId,
      type: 'BOOKING_APPROVED',
      title: 'Booking confirmed',
      body: `Your ground booking (${booking.public_booking_id}) is confirmed.`,
      relatedBookingId: booking.id,
    })
  }

  // Phase 15 — Ground Owner notification, additive alongside the customer's
  // own BOOKING_APPROVED above. Recipient is resolved server-side from the
  // ground the booking actually belongs to (findActiveGroundOwnerUserIds),
  // never from client input — an owner can never be notified about, or
  // spoofed into, a ground they don't own.
  if (bookingType === 'CUSTOMER') {
    const ownerUserIds = await findActiveGroundOwnerUserIds(groundId)
    await Promise.all(
      ownerUserIds.map((ownerUserId) =>
        notificationService.createNotification({
          userId: ownerUserId,
          type: 'GROUND_BOOKING_RECEIVED',
          title: 'New booking received',
          body: `${booking.customer_name} booked your ground (${booking.public_booking_id}).`,
          relatedBookingId: booking.id,
          groundId,
          io,
        }),
      ),
    )
  }

  // Google Calendar sync — strictly AFTER commit, never allowed to affect
  // the booking's own success (Part 13/31). Idempotent by construction: this
  // is the only code path that ever calls createCalendarEvent for a booking,
  // and it only runs once, right here, right after the row is first created.
  if (googleCalendar.isCalendarConfigured()) {
    const sync = await googleCalendar.createCalendarEvent({
      publicBookingId: booking.public_booking_id,
      customerName: booking.customer_name,
      startTime: new Date(booking.start_time),
      endTime: new Date(booking.end_time),
      purpose: bookingType === 'STAFF_BLOCK' ? `Ground Block: ${booking.purpose || 'Ground Block'}` : booking.purpose,
    })
    booking = await bookingRepo.updateGoogleSync(booking.id, { eventId: sync.ok ? sync.eventId : null, status: sync.ok ? 'SYNCED' : 'FAILED' })
    await auditLogService.logEvent({ entityType, entityId: booking.id, action: 'GOOGLE_SYNC', newValue: { status: booking.google_sync_status } })
  } else {
    booking = await bookingRepo.updateGoogleSync(booking.id, { eventId: null, status: 'NOT_CONFIGURED' })
  }

  return { booking, idempotentReplay: false }
}

export async function findBookingByPublicId(publicBookingId) {
  return bookingRepo.findByPublicId(publicBookingId)
}

export async function cancelBooking(publicBookingId, { actingUserId, isStaff, io = null }) {
  const booking = await bookingRepo.findByPublicId(publicBookingId)
  if (!booking) throw new BookingError(BOOKING_ERROR_CODES.BOOKING_NOT_FOUND, 'Booking not found.')
  if (!isStaff && booking.user_id !== actingUserId) {
    throw new BookingError(BOOKING_ERROR_CODES.FORBIDDEN, 'You can only cancel your own bookings.')
  }
  if (booking.status !== 'CONFIRMED') {
    throw new BookingError(BOOKING_ERROR_CODES.ALREADY_CANCELLED, 'This booking is already cancelled.')
  }

  const cancelled = await bookingRepo.cancelBooking(booking.id)

  const entityType = booking.booking_type === 'STAFF_BLOCK' ? 'BLOCK' : 'BOOKING'
  await auditLogService.logEvent({ entityType, entityId: booking.id, action: 'CANCELLED', actorUserId: actingUserId, previousValue: booking, newValue: cancelled })

  if (booking.booking_type === 'CUSTOMER' && booking.user_id) {
    await notificationService.createNotification({
      userId: booking.user_id,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      body: `Your ground booking (${booking.public_booking_id}) has been cancelled.`,
      relatedBookingId: booking.id,
    })
  }

  // Phase 15 — Ground Owner notification, additive alongside the
  // customer's own BOOKING_CANCELLED above.
  if (booking.booking_type === 'CUSTOMER') {
    const ownerUserIds = await findActiveGroundOwnerUserIds(booking.ground_id)
    await Promise.all(
      ownerUserIds.map((ownerUserId) =>
        notificationService.createNotification({
          userId: ownerUserId,
          type: 'GROUND_BOOKING_CANCELLED',
          title: 'Booking cancelled',
          body: `${booking.customer_name}'s booking (${booking.public_booking_id}) was cancelled.`,
          relatedBookingId: booking.id,
          groundId: booking.ground_id,
          io,
        }),
      ),
    )
  }

  // Best-effort calendar cleanup — never blocks the cancellation itself.
  if (booking.google_calendar_event_id) {
    const result = await googleCalendar.cancelCalendarEvent(booking.google_calendar_event_id)
    if (!result.ok) logger.error('Google Calendar cancel failed', { publicBookingId: booking.public_booking_id, error: result.error })
    await auditLogService.logEvent({ entityType, entityId: booking.id, action: 'GOOGLE_SYNC', newValue: { status: result.ok ? 'CANCELLED_SYNCED' : 'CANCEL_FAILED' } })
  }

  return cancelled
}

export async function listMyBookings(userId) {
  return bookingRepo.listByUser(userId)
}

export async function listStaffSchedule({ fromDate, toDate } = {}) {
  const fromUtc = fromDate ? groundLocalToUtc(fromDate, 0, 0) : undefined
  const toUtc = toDate ? groundLocalToUtc(toDate, 24, 0) : undefined
  return bookingRepo.listForStaffSchedule({ fromUtc, toUtc })
}

export async function createStaffBlock({ dateStr, hour, minute = 0, purpose, blockType = null, createdByStaffId, groundId }) {
  return createBooking({ dateStr, hour, minute, customerName: purpose || 'Ground Block', purpose, bookingType: 'STAFF_BLOCK', blockType, createdByStaffId, groundId })
}

export function notifyBookingDateChanged(io, dateStr) {
  publishBookingUpdate(io, dateStr)
}

export { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR, SLOT_DURATION_MINUTES }
