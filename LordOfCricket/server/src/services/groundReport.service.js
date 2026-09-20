import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { deriveDisplayStatus } from '../domain/booking/bookingStatus.js'
import { computeUtilization } from '../domain/booking/utilization.js'
import { groundLocalToUtc, isValidDateStr, addDaysToDateStr } from '../domain/booking/timezone.js'
import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR, GROUND_TIMEZONE } from '../domain/booking/policy.js'
import { BookingError, BOOKING_ERROR_CODES } from '../domain/booking/errors.js'

const MAX_HISTORY_LIMIT = 100
const DEFAULT_HISTORY_LIMIT = 20

// Phase 18 Feature 10/11/12 — booking history search, deterministic reports,
// and ground utilization. Every number derives from the SAME authoritative
// `ground_bookings`/`matches` rows the booking flow and availability engine
// already trust — no cache table, no second truth (same "replay, never
// accumulate" principle README principle #1 already establishes elsewhere).

function assertValidRange(fromDate, toDate) {
  if (!isValidDateStr(fromDate) || !isValidDateStr(toDate)) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, 'A valid date range (YYYY-MM-DD) is required.')
  if (toDate < fromDate) throw new BookingError(BOOKING_ERROR_CODES.INVALID_DATE, 'toDate must not be before fromDate.')
}

/** Feature 10 — search/filter/sort/paginate. Sort is always start_time DESC (newest-first — the one sort order every other history/list surface in this app already uses). */
export async function searchBookingHistory({ q, status, bookingType, fromDate, toDate, limit = DEFAULT_HISTORY_LIMIT, offset = 0 } = {}) {
  const fromUtc = fromDate ? groundLocalToUtc(fromDate, 0, 0) : null
  const toUtc = toDate ? groundLocalToUtc(toDate, 24, 0) : null
  const clampedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT))
  const clampedOffset = Math.max(0, Number(offset) || 0)

  const { rows, total } = await bookingRepo.searchBookings({ q: q || null, status: status || null, bookingType: bookingType || null, fromUtc, toUtc, limit: clampedLimit, offset: clampedOffset })
  const now = new Date()
  return {
    pagination: { limit: clampedLimit, offset: clampedOffset, total },
    items: rows.map((r) => ({
      publicBookingId: r.public_booking_id,
      bookingType: r.booking_type,
      blockType: r.block_type,
      customerName: r.customer_name,
      purpose: r.purpose,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      displayStatus: deriveDisplayStatus(r, now),
      createdAt: r.created_at,
    })),
  }
}

/** Feature 11 — deterministic report: bookings/completed/cancelled counts, busy days, peak hours. "Completed" = confirmed and never cancelled (see docs/ARCHITECTURE.md's Phase 18 section for why COMPLETED isn't a separate stored state). No revenue analytics (Part explicitly excludes it — this app has no payment integration). */
export async function getBookingReport({ fromDate, toDate }) {
  assertValidRange(fromDate, toDate)
  const fromUtc = groundLocalToUtc(fromDate, 0, 0)
  const toUtc = groundLocalToUtc(toDate, 24, 0)

  const [statusRows, busyDays, peakHours] = await Promise.all([
    bookingRepo.countBookingsByStatus(fromUtc, toUtc),
    bookingRepo.countBookingsByDate(fromUtc, toUtc, GROUND_TIMEZONE),
    bookingRepo.countBookingsByHour(fromUtc, toUtc, GROUND_TIMEZONE),
  ])
  const statusCounts = { CONFIRMED: 0, CANCELLED: 0 }
  for (const row of statusRows) statusCounts[row.status] = row.count

  return {
    range: { fromDate, toDate },
    totalBookings: statusCounts.CONFIRMED + statusCounts.CANCELLED,
    completed: statusCounts.CONFIRMED,
    cancelled: statusCounts.CANCELLED,
    busyDays: busyDays.slice(0, 10),
    peakHours: peakHours.slice(0, 5),
  }
}

/**
 * Feature 12 — Ground Utilization %.
 *
 *   utilizedPercentage = (bookedHours + blockedHours + matchHours) / totalHours * 100
 *
 * `totalHours` = number of ground-local calendar days in range × the ground's
 * real daily operating window (GROUND_CLOSING_HOUR - GROUND_OPENING_HOUR) —
 * never a fabricated 24-hour day. `bookedHours`/`blockedHours` are the real,
 * EXCLUDE-constraint-protected durations of CONFIRMED bookings/blocks (they
 * can never overlap each other or a match day — see the match-day pre-check
 * in groundBooking.service.js#createBooking — so summing them is never
 * double-counting). `matchHours` uses the same whole-operating-day
 * convention the availability engine/timeline already use for matches.
 */
export async function getUtilization({ fromDate, toDate }) {
  assertValidRange(fromDate, toDate)
  const fromUtc = groundLocalToUtc(fromDate, 0, 0)
  const toUtc = groundLocalToUtc(toDate, 24, 0)

  let numDays = 0
  for (let d = fromDate; d <= toDate; d = addDaysToDateStr(d, 1)) numDays++
  const hoursPerDay = GROUND_CLOSING_HOUR - GROUND_OPENING_HOUR
  const totalHours = numDays * hoursPerDay

  const [hoursByType, matchDates] = await Promise.all([
    bookingRepo.sumOccupiedHoursByType(fromUtc, toUtc),
    bookingRepo.listMatchDatesInRange(fromDate, addDaysToDateStr(toDate, 1)),
  ])
  const bookedHours = hoursByType.find((r) => r.booking_type === 'CUSTOMER')?.hours || 0
  const blockedHours = hoursByType.find((r) => r.booking_type === 'STAFF_BLOCK')?.hours || 0
  const matchHours = matchDates.length * hoursPerDay

  return { range: { fromDate, toDate }, ...computeUtilization({ totalHours, bookedHours, blockedHours, matchHours }) }
}
