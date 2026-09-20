// Phase 17 — over-by-over score/run-rate progression for a worm-style chart.
// Built off the same enriched `state.deliveries` replay.js already produces;
// run rate / required run rate reuse selectors.js's existing legal-ball-based
// formulas verbatim (Part 26/53 — never a decimal-overs parse, never a second
// run-rate formula).

import { calculateRunRate, calculateRequiredRunRate } from '../scoring/selectors.js'

/**
 * One point per over that had at least one recorded delivery, ascending,
 * including a final PARTIAL over (an over with fewer than ballsPerOver legal
 * deliveries because the innings ended mid-over) — the last point's
 * cumulativeLegalBalls simply reflects however many legal balls were
 * actually bowled, never padded to a full over.
 */
export function buildScoreProgression(deliveries, ballsPerOver) {
  const relevant = deliveries.filter((d) => !d.voided && !d.isDeadBall)
  const overMap = new Map()
  let cumRuns = 0
  let cumWickets = 0
  let cumLegalBalls = 0

  for (const d of relevant) {
    cumRuns += d.totalRuns
    if (d.wicket) cumWickets += 1
    if (d.isLegalDelivery) cumLegalBalls += 1
    overMap.set(d.over, { over: d.over, cumulativeRuns: cumRuns, cumulativeWickets: cumWickets, cumulativeLegalBalls: cumLegalBalls })
  }

  return [...overMap.values()]
    .sort((a, b) => a.over - b.over)
    .map((p) => ({ ...p, runRate: calculateRunRate(p.cumulativeRuns, p.cumulativeLegalBalls, ballsPerOver) }))
}

/** Adds `requiredRunRate` to each progression point of a CHASING innings (target from innings 1). Non-chase innings (target null) get requiredRunRate: null throughout. */
export function attachRequiredRunRate(points, target, oversPerInnings, ballsPerOver) {
  if (target == null || oversPerInnings == null) return points.map((p) => ({ ...p, requiredRunRate: null }))
  return points.map((p) => {
    const ballsRemaining = Math.max(0, oversPerInnings * ballsPerOver - p.cumulativeLegalBalls)
    return { ...p, requiredRunRate: calculateRequiredRunRate(target, p.cumulativeRuns, ballsRemaining, ballsPerOver) }
  })
}
