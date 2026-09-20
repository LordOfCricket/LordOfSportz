import { MAX_RECOMMENDATIONS } from './policy.js'
import { groundLocalToUtc, utcToGroundLocalParts, addDaysToDateStr } from './timezone.js'

// Phase 14 Part 3 (23/24/55) — deterministic nearby-slot recommendations, no
// AI. Pure function: `availabilityLookup(dateStr)` is injected so this stays
// testable with a fake in-memory calendar, while the service wires the real
// DB-backed lookup (groundBooking.service.js#getDayAvailability). Every
// candidate returned is already AVAILABLE under the exact same rules used
// for the requested slot — never a stale/optimistic guess.

function sameLocalTime(startTime, hour, minute) {
  const parts = utcToGroundLocalParts(startTime)
  return parts.hour === hour && parts.minute === minute
}

/**
 * @param requestedDateStr 'YYYY-MM-DD'
 * @param requestedHour local hour the customer wanted
 * @param requestedMinute local minute the customer wanted
 * @param availabilityLookup (dateStr) => [{ startTime, endTime, status }]
 */
export function findNearbyAlternatives(requestedDateStr, requestedHour, requestedMinute, availabilityLookup, { maxResults = MAX_RECOMMENDATIONS, maxDaysAhead = 7 } = {}) {
  const results = []
  const seen = new Set()

  const addSlot = (slot, dateStr) => {
    if (results.length >= maxResults) return
    const key = `${dateStr}:${slot.startTime.toISOString()}`
    if (seen.has(key)) return
    seen.add(key)
    results.push(slot)
  }

  const requestedStart = groundLocalToUtc(requestedDateStr, requestedHour, requestedMinute)
  const sameDaySlots = availabilityLookup(requestedDateStr)

  // Priority 1 — same day, nearest EARLIER available time.
  const earlier = sameDaySlots
    .filter((s) => s.status === 'AVAILABLE' && s.startTime.getTime() < requestedStart.getTime())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
  // Priority 2 — same day, nearest LATER available time.
  const later = sameDaySlots
    .filter((s) => s.status === 'AVAILABLE' && s.startTime.getTime() > requestedStart.getTime())
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

  if (earlier[0]) addSlot(earlier[0], requestedDateStr)
  if (later[0]) addSlot(later[0], requestedDateStr)

  // Priority 3 — next day(s), same local time as originally requested.
  for (let offset = 1; offset <= maxDaysAhead && results.length < maxResults; offset++) {
    const dateStr = addDaysToDateStr(requestedDateStr, offset)
    const daySlots = availabilityLookup(dateStr)
    const match = daySlots.find((s) => s.status === 'AVAILABLE' && sameLocalTime(s.startTime, requestedHour, requestedMinute))
    if (match) addSlot(match, dateStr)
  }

  // Priority 4 — other nearby valid slots: more of the same-day near misses first...
  for (let i = 1; i < Math.max(earlier.length, later.length) && results.length < maxResults; i++) {
    if (later[i]) addSlot(later[i], requestedDateStr)
    if (results.length >= maxResults) break
    if (earlier[i]) addSlot(earlier[i], requestedDateStr)
  }
  // ...then any other available slot on subsequent days, bounded by maxDaysAhead.
  for (let offset = 1; offset <= maxDaysAhead && results.length < maxResults; offset++) {
    const dateStr = addDaysToDateStr(requestedDateStr, offset)
    for (const s of availabilityLookup(dateStr)) {
      if (results.length >= maxResults) break
      if (s.status === 'AVAILABLE') addSlot(s, dateStr)
    }
  }

  return results
}
