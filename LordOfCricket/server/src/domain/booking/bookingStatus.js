// Phase 18 Feature 9 — booking status. LOC's original `ground_bookings`
// walk-in flow has no manual approval step (Phase 14: auto-confirm by
// design — the EXCLUDE constraint is the only gate). For that flow,
// PENDING/REJECTED/EXPIRED never occur, so `deriveDisplayStatus` below
// still only derives the states that ARE real for it: `CONFIRMED`/
// `CANCELLED` plus a computed `COMPLETED`. `CONFIRMED` displays as
// "Approved" for walk-in bookings specifically — the closest honest
// equivalent, since auto-confirm IS the approval in that flow.
//
// Phase 24 widens the STORED status column itself to a real, larger state
// machine for the multi-ground/team/player conflict engine (match/practice
// bookings, proposals, holds, no-shows) — see schema.sql Phase 24. Blocking
// statuses (occupy the ground/team/player slot tables) vs non-blocking
// mirrors exactly the ground_bookings_no_overlap EXCLUDE constraint's own
// WHERE clause; keep the two in sync if either ever changes.

export const BLOCKING_STATUSES = Object.freeze(['HOLD', 'PROPOSED', 'PENDING', 'CONFIRMED'])
export const NON_BLOCKING_STATUSES = Object.freeze(['REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'])

export function isBlockingStatus(status) {
  return BLOCKING_STATUSES.includes(status)
}

export function deriveDisplayStatus(booking, now = new Date()) {
  if (booking.status === 'CANCELLED') return 'CANCELLED'
  if (booking.status !== 'CONFIRMED') return booking.status
  if (new Date(booking.end_time).getTime() <= now.getTime()) return 'COMPLETED'
  return 'APPROVED'
}

const VALID_TRANSITIONS = {
  HOLD: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PROPOSED: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED', 'NO_SHOW', 'COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
  COMPLETED: [],
  NO_SHOW: [],
}

/** Validates a STORED status transition (never the walk-in flow's derived
 * "Approved"/COMPLETED display states, which are never real transition
 * targets for that flow). */
export function isValidStatusTransition(fromStatus, toStatus) {
  return Boolean(VALID_TRANSITIONS[fromStatus]?.includes(toStatus))
}
