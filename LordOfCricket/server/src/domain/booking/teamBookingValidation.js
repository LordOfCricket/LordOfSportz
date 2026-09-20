// Phase 24 — time-range validation for MATCH/PRACTICE bookings. Unlike the
// walk-in flow's validateSlotAlignment (groundBooking.service.js), this
// does NOT require a fixed slot width or a fixed offset alignment — §16
// explicitly requires supporting custom durations/start times for these
// purposes. Operates on real UTC Date instants throughout; ground operating
// hours are ground-LOCAL wall-clock hours, compared via the same fixed
// +05:30 offset math domain/shared/groundTime.js already centralizes.

import { BookingError, BOOKING_ERROR_CODES } from './errors.js'
import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR, MAX_BOOKING_HORIZON_DAYS } from './policy.js'
import { utcToGroundLocalParts } from '../shared/groundTime.js'

/** A ground's effective operating hours: its own opening_hour/closing_hour
 * when configured, else the platform-wide policy default. */
export function resolveGroundHours(ground) {
  return {
    openingHour: ground?.opening_hour ?? GROUND_OPENING_HOUR,
    closingHour: ground?.closing_hour ?? GROUND_CLOSING_HOUR,
  }
}

function minutesSinceMidnight({ hour, minute }) {
  return hour * 60 + minute
}

/** Validates an arbitrary [startTime, endTime) instant range: well-formed,
 * end after start, not in the past, within the booking horizon, and fully
 * inside the ground's operating hours on both the start day and (for a
 * range that doesn't cross midnight — the only shape this app supports,
 * matching the existing walk-in flow's same assumption) the end time. */
export function validateBookingTimeRange({ startTime, endTime, ground, now = new Date() }) {
  if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime()) || !(endTime instanceof Date) || Number.isNaN(endTime.getTime())) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A valid start and end time are required.')
  }
  if (endTime.getTime() <= startTime.getTime()) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'End time must be after start time.')
  }
  if (startTime.getTime() < now.getTime()) {
    throw new BookingError(BOOKING_ERROR_CODES.PAST_TIME, 'That time has already passed.')
  }
  const maxInstant = now.getTime() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000
  if (startTime.getTime() > maxInstant) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, `Bookings are only open up to ${MAX_BOOKING_HORIZON_DAYS} days ahead.`)
  }

  const { openingHour, closingHour } = resolveGroundHours(ground)
  const startParts = utcToGroundLocalParts(startTime)
  const endParts = utcToGroundLocalParts(endTime)
  const crossesCalendarDay = startParts.year !== endParts.year || startParts.month !== endParts.month || startParts.day !== endParts.day
  const startMinutes = minutesSinceMidnight(startParts)
  // An end time exactly at local midnight (00:00) the NEXT calendar day is
  // the honest "closes at midnight" edge case — represent it as 24:00 on
  // the start day rather than 0:00, so it compares correctly against
  // closingHour instead of looking like the range starts after it ends.
  const endMinutes = crossesCalendarDay ? minutesSinceMidnight(endParts) + 24 * 60 : minutesSinceMidnight(endParts)
  if (crossesCalendarDay && !(endParts.hour === 0 && endParts.minute === 0)) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, 'A booking cannot span more than one calendar day.')
  }
  if (startMinutes < openingHour * 60 || endMinutes > closingHour * 60) {
    throw new BookingError(BOOKING_ERROR_CODES.INVALID_SLOT, `This ground is only open ${String(openingHour).padStart(2, '0')}:00–${String(closingHour).padStart(2, '0')}:00.`)
  }
}
