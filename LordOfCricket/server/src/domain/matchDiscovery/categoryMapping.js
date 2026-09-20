// Phase 10 Part 1 — the ONE place category <-> persisted status/order mapping
// lives. Controllers/services/tests import from here rather than scattering
// 'live'/'upcoming'/'completed'/'finalized' string literals around (Part 3).
//
// LIVE also covers "innings break" (innings 1 finished, innings 2 not yet
// started) — matches.status never gains a separate 'innings_break' value
// (Phase 9 already established this: it's a derived sub-state), so LIVE's
// status list stays just ['live'].

export const CATEGORY_CONFIG = {
  LIVE: { statuses: ['live'], order: 'live' },
  UPCOMING: { statuses: ['upcoming'], order: 'upcoming' },
  RESULTS: { statuses: ['completed', 'finalized'], order: 'results' },
}

export function isValidCategory(category) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_CONFIG, category)
}

export const DEFAULT_LIST_LIMIT = 20
export const MAX_LIST_LIMIT = 50

export const HOME_UPCOMING_LIMIT = 3
export const HOME_RESULTS_LIMIT = 3

// User-facing labels, centralized (Part 15) — never leak a raw status enum
// into the UI. isInningsBreak is checked before this map, same pattern as
// Phase 9's MatchHero.jsx.
export const STATUS_LABEL = {
  upcoming: 'Upcoming',
  live: 'Live',
  completed: 'Awaiting Finalization',
  finalized: 'Official Result',
}
