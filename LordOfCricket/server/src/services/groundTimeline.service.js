import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { groundLocalToUtc } from '../domain/booking/timezone.js'
import { addDaysToDateStr, isValidDateStr } from '../domain/booking/timezone.js'
import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR } from '../domain/booking/policy.js'
import { buildDailyTimeline } from '../domain/booking/timeline.js'
import { blockTypeLabel } from '../domain/booking/blockTypes.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'

// Phase 18 Feature 1/8 — the ONE central place that reads every occupancy
// source (confirmed bookings, staff blocks — both from the SAME existing
// ground_bookings query, `listConfirmedInRange` — plus matches/tournament
// fixtures via `listMatchEntriesInRange`) and turns them into a single
// ordered daily schedule. No new occupancy source, no duplicated "is this
// occupied" logic — this is a labeled RESHAPING of the exact same data
// domain/booking/availability.js#computeDayAvailability already reads for
// slot-grid availability (Part 1's "everything asks this service").

function labelForBooking(row) {
  if (row.booking_type === 'STAFF_BLOCK') return blockTypeLabel(row.block_type) || row.purpose || 'Ground Block'
  return row.purpose || 'Booking'
}

export async function getDailyTimeline(dateStr) {
  if (!isValidDateStr(dateStr)) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, 'A valid date (YYYY-MM-DD) is required.')

  const dayStart = groundLocalToUtc(dateStr, GROUND_OPENING_HOUR, 0)
  const dayEnd = groundLocalToUtc(dateStr, GROUND_CLOSING_HOUR, 0)
  const wholeDayStart = groundLocalToUtc(dateStr, 0, 0)
  const wholeDayEnd = groundLocalToUtc(dateStr, 24, 0)

  const [bookingRows, matchRows] = await Promise.all([
    bookingRepo.listConfirmedInRange(wholeDayStart, wholeDayEnd),
    bookingRepo.listMatchEntriesInRange(dateStr, addDaysToDateStr(dateStr, 1)),
  ])

  const entries = bookingRows.map((row) => ({
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    type: row.booking_type === 'STAFF_BLOCK' ? 'BLOCK' : 'BOOKING',
    label: labelForBooking(row),
    publicId: row.public_booking_id,
  }))

  // Whole-day convention — match_date has no end time (Part 37, documented in
  // groundBooking.repository.js), so a match is shown as occupying the
  // ground's full operating window, exactly like the availability engine's
  // own existing MATCH reason already does for slot-level availability.
  for (const m of matchRows) {
    entries.push({
      startTime: dayStart,
      endTime: dayEnd,
      type: 'MATCH',
      label: m.tournament_name ? `${m.team_a_name} vs ${m.team_b_name} (${m.tournament_name})` : `${m.team_a_name} vs ${m.team_b_name}`,
      matchId: m.id,
    })
  }

  const segments = buildDailyTimeline(entries, dayStart, dayEnd)
  return {
    date: dateStr,
    segments: segments.map((s) => ({ ...s, startTime: s.startTime.toISOString(), endTime: s.endTime.toISOString() })),
  }
}
