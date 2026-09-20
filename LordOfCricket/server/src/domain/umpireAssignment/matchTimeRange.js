// Umpire double-booking prevention — pure, zero-I/O (same "domain is pure"
// convention as domain/scoring and domain/booking). `matches` has no end
// time (only `match_date`, documented elsewhere as deliberately never
// fabricated into a time range for GROUND-occupancy purposes) — but an
// umpire's own schedule-conflict check needs a real interval, not a
// whole-day block, or two matches hours apart at different grounds would be
// wrongly treated as conflicting. The estimate is derived from the match's
// own real, stored format data (overs_per_innings/balls_per_over), never
// invented from nothing, and is deliberately conservative (errs toward
// blocking a borderline case rather than allowing a real double-booking).
const MINUTES_PER_OVER_PER_INNINGS = 8
const DEFAULT_DURATION_MINUTES = 240 // no overs_per_innings set (nullable) — a sane 4-hour default

export function estimateMatchDurationMinutes({ overs_per_innings } = {}) {
  if (overs_per_innings == null) return DEFAULT_DURATION_MINUTES
  return overs_per_innings * 2 * MINUTES_PER_OVER_PER_INNINGS
}

/** [start, end) — start is the real match_date, end is start + the estimated
 * duration above. `match.match_date` may be a Date or an ISO string. */
export function estimateMatchTimeRange(match) {
  const start = match.match_date instanceof Date ? match.match_date : new Date(match.match_date)
  const end = new Date(start.getTime() + estimateMatchDurationMinutes(match) * 60000)
  return { start, end }
}

// Phase 2 (Umpire Interest+Assignment audit) — the 24-hour confirmation
// lock. Reuses estimateMatchTimeRange's own `start` (the real match_date,
// same instant the conflict-overlap check already keys off) rather than a
// second date-parsing path, so this can never drift from what "the match's
// scheduled start" means anywhere else in this codebase. Exact hours before
// kickoff, never a calendar-day rule — deliberately scoped to CONFIRMED-
// assignment changes only (self-cancel today); filling a still-open slot
// (self-apply/propose/accept) and the no-show/replacement emergency path
// are NOT gated by this — see cancelAssignment's own comment for why.
export const ASSIGNMENT_LOCK_HOURS = 24

export function isAssignmentLocked(match, { now = new Date() } = {}) {
  const { start } = estimateMatchTimeRange(match)
  return start.getTime() - now.getTime() <= ASSIGNMENT_LOCK_HOURS * 60 * 60000
}
