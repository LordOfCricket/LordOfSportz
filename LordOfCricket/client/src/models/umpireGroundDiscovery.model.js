// Pure helpers for the umpire ground-wise discovery page — no fetching
// here, hooks own that; this just shapes data the backend already
// returned. Mirrors umpireDashboard.model.js's "pure logic" convention.
export { formatMatchDate, formatMatchTime } from './matchDiscovery.model.js'

// Order matters: already-assigned wins even though the umpire's own slot
// counts toward filledSlots (so a 2/2 match the umpire is themselves part
// of shows "you're assigned", not "fully staffed"); required=0 is checked
// before the fill comparison so a match nobody needs an umpire for never
// reads as "fully staffed" (0/0 would otherwise be filled>=required too).
// SCHEDULE_CONFLICT is checked before FULLY_STAFFED/OPEN — a match this
// umpire can't take due to a real time overlap with another assignment is
// never actionable regardless of how many slots happen to be open. This
// mirrors (never recomputes) the backend's own hasScheduleConflict flag —
// purely advisory: applyForSlot re-checks for real inside its own
// transaction, so a stale flag here can never let a bad apply through.
export function slotState(match) {
  if (match.currentUserAssigned) return 'ASSIGNED'
  if (match.hasScheduleConflict) return 'SCHEDULE_CONFLICT'
  if (!match.requiredUmpires) return 'NOT_REQUIRED'
  if (match.filledSlots >= match.requiredUmpires) return 'FULLY_STAFFED'
  return 'OPEN'
}
