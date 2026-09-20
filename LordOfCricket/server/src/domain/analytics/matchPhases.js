// Phase 17 — generic, format-length-aware match phases for analytics.
//
// Deliberately NOT the same concept as selectors.js#getMatchPhase (that one
// hard-codes a T20-style "Powerplay = first 6 overs / Death = last 5 overs"
// convention for the LIVE scoring UI, which is a reasonable heuristic label
// during play but is exactly the kind of "blindly hard-coded T20 boundaries"
// the Phase 17 brief calls out as unsafe for a general-purpose analytics
// feature — LOC supports arbitrary overs-per-innings club matches, not just
// 20-over games). This file instead splits an innings into three
// proportional, deterministic thirds — Opening/Middle/Closing — named
// generically so nothing here claims an official Powerplay/Death-overs rule
// LOC does not actually store.
//
// Matches shorter than MIN_OVERS_FOR_PHASE_SPLIT, or with no overs limit at
// all (oversPerInnings === null — LOC supports unlimited-overs matches),
// cannot be split meaningfully — callers must treat a null return as "phase
// analytics not available for this innings," never guess a fallback split.

const MIN_OVERS_FOR_PHASE_SPLIT = 3

export const PHASE_NAMES = ['Opening Phase', 'Middle Phase', 'Closing Phase']

export function computePhaseBoundaries(oversPerInnings) {
  if (!oversPerInnings || oversPerInnings < MIN_OVERS_FOR_PHASE_SPLIT) return null
  const third = Math.max(1, Math.round(oversPerInnings / 3))
  const openingEndOver = third
  const closingStartOver = Math.max(openingEndOver + 1, oversPerInnings - third + 1)
  return { openingEndOver, closingStartOver, oversPerInnings }
}

export function phaseForOver(overNumber, boundaries) {
  if (!boundaries) return null
  if (overNumber <= boundaries.openingEndOver) return 'Opening Phase'
  if (overNumber >= boundaries.closingStartOver) return 'Closing Phase'
  return 'Middle Phase'
}
