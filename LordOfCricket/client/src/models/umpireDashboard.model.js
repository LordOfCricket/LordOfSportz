// U4 — pure helpers for the umpire dashboard/my-assignments/profile pages
// (and ground discovery's own apply flow, which shares applyErrorMessage
// below). No API calls here; hooks own fetching, these just shape data the
// backend already returned.

export function slotSummary(match) {
  const total = match?.total_slots ?? 0
  const filled = match?.filled_slots ?? 0
  return { total, filled, open: Math.max(total - filled, 0) }
}

// Buckets for "My Matches" (U4). An
// ASSIGNED slot's bucket follows the MATCH's lifecycle (upcoming/live/past);
// a slot already COMPLETED (officiating credit, written the instant its
// match completes) always belongs in `completed` regardless of
// match_status, since match_status only reaches 'finalized' after. CANCELLED
// and NO_SHOW are their own buckets — real, disclosed history, not hidden
// the way U4 originally deferred it.
export function bucketAssignments(assignments) {
  const upcoming = []
  const live = []
  const completed = []
  const cancelled = []
  const noShow = []
  for (const a of assignments || []) {
    if (a.status === 'ASSIGNED') {
      if (a.match_status === 'live') live.push(a)
      else if (a.match_status === 'upcoming') upcoming.push(a)
      else completed.push(a)
    } else if (a.status === 'COMPLETED') {
      completed.push(a)
    } else if (a.status === 'CANCELLED') {
      cancelled.push(a)
    } else if (a.status === 'NO_SHOW') {
      noShow.push(a)
    }
  }
  return { upcoming, live, completed, cancelled, noShow }
}

// The single soonest upcoming assignment (Umpire Dashboard's
// "Next Assignment" card). `upcoming` isn't guaranteed date-sorted (the
// backend orders by match_date DESC for the whole list), so this picks the
// minimum explicitly rather than trusting index 0.
export function nextAssignment(upcoming) {
  if (!upcoming?.length) return null
  return upcoming.reduce((soonest, a) => (new Date(a.match_date) < new Date(soonest.match_date) ? a : soonest))
}

// Phase 2 (Umpire Interest+Assignment audit) — mirrors
// matchTimeRange.js#isAssignmentLocked exactly (same 24h-before-kickoff
// instant, never a calendar-day rule), so the UI's "locked" state can never
// drift from what the backend will actually enforce.
const ASSIGNMENT_LOCK_HOURS = 24

export function isAssignmentLocked(matchDate, now = new Date()) {
  if (!matchDate) return false
  return new Date(matchDate).getTime() - now.getTime() <= ASSIGNMENT_LOCK_HOURS * 60 * 60000
}

// Mirrors the backend exactly (umpireAssignment.service.js's cancelAssignment,
// U3.1: self-cancel is upcoming-only, Phase 2: also locked within 24h of
// kickoff) — the frontend gate is UX only, the backend remains authoritative
// regardless of what this returns.
export function canCancelAssignment(assignment) {
  return assignment?.status === 'ASSIGNED' && assignment?.match_status === 'upcoming' && !isAssignmentLocked(assignment?.match_date)
}

export function canEnterScoring(assignment) {
  return assignment?.status === 'ASSIGNED' && assignment?.match_status === 'live'
}

// Maps the backend's UmpireAssignmentError codes (domain/umpireAssignment/
// errors.js) to a message an umpire can act on — covers the race-condition
// case explicitly (U4's "handle 409 gracefully" requirement).
export function applyErrorMessage(code, fallback) {
  switch (code) {
    case 'NO_SLOT_AVAILABLE':
      return 'This umpire slot was just filled by another umpire.'
    case 'ALREADY_ASSIGNED':
      return "You're already assigned to umpire this match."
    case 'MATCH_NOT_ELIGIBLE':
      return 'This match is no longer accepting umpire applications.'
    case 'NOT_APPROVED_UMPIRE':
      return 'Your umpire approval is no longer active.'
    case 'MATCH_NOT_FOUND':
      return 'This match no longer exists.'
    case 'OVERLAPPING_ASSIGNMENT':
      return 'You already have an umpire assignment that overlaps with this match\'s time — an umpire can only officiate one match at a time.'
    default:
      return fallback || 'Unable to apply for this match.'
  }
}

export function cancelErrorMessage(code, fallback) {
  switch (code) {
    case 'MATCH_NOT_ELIGIBLE':
      return 'This match is no longer eligible for cancellation.'
    case 'ASSIGNMENT_NOT_FOUND':
      return "You don't have an active assignment for this match."
    case 'MATCH_NOT_FOUND':
      return 'This match no longer exists.'
    case 'ASSIGNMENT_LOCKED':
      return 'Assignment changes are locked within 24 hours of the match start. Contact the ground owner if you can no longer officiate.'
    default:
      return fallback || 'Unable to cancel this assignment.'
  }
}
