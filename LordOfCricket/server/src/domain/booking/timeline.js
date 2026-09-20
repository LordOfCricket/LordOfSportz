// Phase 18 Feature 8 — the ground's daily timeline. Pure reshaping: turns a
// flat list of occupied entries (bookings/blocks/matches, already resolved by
// the service layer from the SAME occupancy sources the availability engine
// itself reads — never a second "is this occupied" computation) into an
// ordered day schedule that also names the FREE gaps between them.

/** `entries`: [{startTime: Date, endTime: Date, type: 'BOOKING'|'BLOCK'|'MATCH', label: string}], any order. `dayStart`/`dayEnd`: Date. */
export function buildDailyTimeline(entries, dayStart, dayEnd) {
  const sorted = entries.slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const segments = []
  let cursor = dayStart

  for (const entry of sorted) {
    if (entry.startTime.getTime() > cursor.getTime()) {
      segments.push({ startTime: cursor, endTime: entry.startTime, type: 'FREE', label: 'Free' })
    }
    segments.push({ startTime: entry.startTime, endTime: entry.endTime, type: entry.type, label: entry.label })
    if (entry.endTime.getTime() > cursor.getTime()) cursor = entry.endTime
  }

  if (cursor.getTime() < dayEnd.getTime()) {
    segments.push({ startTime: cursor, endTime: dayEnd, type: 'FREE', label: 'Free' })
  }

  return segments
}
