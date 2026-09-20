import { rangesOverlap } from '../booking/availability.js'

// Ground Time-Slot Pricing — pure interval logic. Zero I/O, same "domain is
// pure" convention as domain/booking/availability.js. Pricing slots are
// TIME-of-day (recurring daily rules), not real calendar instants, so this
// module works in plain minutes-since-midnight rather than Date objects —
// but reuses rangesOverlap's own [start,end) semantics directly (wrapping
// minutes in throwaway Date objects) rather than reimplementing overlap
// arithmetic a second time.

/** Postgres TIME columns arrive via `pg` as 'HH:MM:SS' strings; also
 * accepts a plain 'HH:MM' input from a request body. */
export function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number)
  return h * 60 + m
}

function toComparable(minutes) {
  return new Date(minutes * 60000)
}

/** Same half-open [start,end) semantics as domain/booking/availability.js#
 * rangesOverlap (touching ranges — one ends exactly when the other starts —
 * do NOT overlap), reused directly rather than reimplemented. */
export function timeRangesOverlap(aStartMinutes, aEndMinutes, bStartMinutes, bEndMinutes) {
  return rangesOverlap(toComparable(aStartMinutes), toComparable(aEndMinutes), toComparable(bStartMinutes), toComparable(bEndMinutes))
}

/** True if [startMinutes,endMinutes) overlaps any OTHER ACTIVE slot in
 * `existingSlots` — the create/edit-time validation check. `excludeSlotId`
 * lets an edit compare against every slot except the one being edited.
 * Inactive slots never conflict — a deactivated slot's old time range is
 * free to be reused. */
export function hasOverlappingActiveSlot(existingSlots, startMinutes, endMinutes, excludeSlotId = null) {
  return existingSlots.some((s) => {
    if (!s.is_active) return false
    if (excludeSlotId != null && s.id === excludeSlotId) return false
    return timeRangesOverlap(startMinutes, endMinutes, timeToMinutes(s.start_time), timeToMinutes(s.end_time))
  })
}

/** The single ACTIVE pricing slot whose [start,end) contains `minutes`
 * (a booking's start time-of-day), or null if none does. Deliberately a
 * START-TIME-ONLY lookup, never a "does this booking's whole [2h] range
 * stay inside one slot" check — LOC's booking model is a fixed-width slot
 * (domain/booking/policy.js), not a customer-chosen duration, so a 2-hour
 * booking CAN straddle a pricing-slot boundary if a Ground Owner configures
 * bands that don't align to the 2-hour grid (the brief's own example
 * doesn't). Rather than invent proration (explicitly warned against), the
 * price is simply whichever slot the booking STARTS in — simple,
 * deterministic, and stated plainly wherever it's surfaced. */
export function findSlotContainingTime(slots, minutes) {
  return slots.find((s) => s.is_active && minutes >= timeToMinutes(s.start_time) && minutes < timeToMinutes(s.end_time)) || null
}
