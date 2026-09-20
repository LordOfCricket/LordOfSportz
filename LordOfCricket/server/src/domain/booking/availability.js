import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR, SLOT_DURATION_MINUTES } from './policy.js'
import { groundLocalToUtc, groundTodayDateStr } from './timezone.js'

// Phase 14 Part 3 — pure availability/overlap logic. Zero I/O, zero
// PostgreSQL imports (same "domain is pure" convention as domain/scoring) —
// the service layer feeds this real booking/match/block data and this module
// only does interval arithmetic. This is what all the concurrency/overlap
// unit tests exercise directly, without a database.

/** Half-open interval overlap — matches the DB exclusion constraint's `[)`
 * semantics exactly (Part 20): touching ranges (one ends exactly when the
 * other starts) do NOT overlap. */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
}

/** The fixed slot grid for one ground-local calendar date — every slot is
 * exactly SLOT_DURATION_MINUTES long, back-to-back from opening to closing.
 * Returns UTC instants; nothing here is display-formatted. */
export function generateSlotGrid(dateStr) {
  const slots = []
  const dayStart = groundLocalToUtc(dateStr, GROUND_OPENING_HOUR, 0)
  const dayEnd = groundLocalToUtc(dateStr, GROUND_CLOSING_HOUR, 0)
  let cursor = dayStart
  while (cursor.getTime() + SLOT_DURATION_MINUTES * 60000 <= dayEnd.getTime()) {
    const end = new Date(cursor.getTime() + SLOT_DURATION_MINUTES * 60000)
    slots.push({ startTime: cursor, endTime: end })
    cursor = end
  }
  return slots
}

/**
 * Marks each slot in the grid AVAILABLE/UNAVAILABLE against real occupancy.
 * `occupiedRanges` is a flat list of `{ startTime, endTime, reason }` — the
 * service layer is responsible for building this from ground_bookings
 * (CONFIRMED only) + staff blocks (already the same table/reason) + LOC match
 * days (Part 37 — a coarse whole-day block, see groundBooking.service.js for
 * why: match_date is the only scheduling column, no end time exists to
 * compute a real range from).
 */
export function computeDayAvailability(dateStr, occupiedRanges, { now = new Date() } = {}) {
  const slots = generateSlotGrid(dateStr)
  return slots.map((slot) => {
    if (slot.startTime.getTime() < now.getTime()) {
      return { ...slot, status: 'UNAVAILABLE', reason: 'PAST' }
    }
    const conflict = occupiedRanges.find((r) => rangesOverlap(slot.startTime, slot.endTime, r.startTime, r.endTime))
    if (conflict) {
      return { ...slot, status: 'UNAVAILABLE', reason: conflict.reason }
    }
    return { ...slot, status: 'AVAILABLE', reason: null }
  })
}

export function isPastDate(dateStr) {
  return dateStr < groundTodayDateStr()
}
