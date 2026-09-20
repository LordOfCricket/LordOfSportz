// Phase 17 — per-phase breakdown of an innings, built directly off the same
// enriched `state.deliveries` array replay.js already produces (Phase 3) and
// buildInningsSummary.js already consumes for the scorecard — no second
// replay/scoring engine, this file only groups already-authoritative
// per-delivery facts by phase.
//
// The dot-ball predicate (`totalRuns === 0 && !wicket`) is copied verbatim
// from replay.js's `isDot` definition (the same one that feeds
// state.bowlers[id].dots) — never a second, independently-invented
// definition of "dot ball" (Part 68 — one cricket truth).

import { calculateRunRate } from '../scoring/selectors.js'
import { computePhaseBoundaries, phaseForOver, PHASE_NAMES } from './matchPhases.js'

/** Returns null when the innings' overs limit is too short to split into phases (see matchPhases.js). */
export function buildPhaseMetrics(deliveries, oversPerInnings, ballsPerOver) {
  const boundaries = computePhaseBoundaries(oversPerInnings)
  if (!boundaries) return null

  const buckets = new Map(
    PHASE_NAMES.map((name) => [name, { phase: name, runs: 0, wickets: 0, legalBalls: 0, fours: 0, sixes: 0, dotBalls: 0 }])
  )

  for (const d of deliveries) {
    if (d.voided || d.isDeadBall) continue
    const phase = phaseForOver(d.over, boundaries)
    if (!phase) continue
    const bucket = buckets.get(phase)
    bucket.runs += d.totalRuns
    if (d.wicket) bucket.wickets += 1
    if (d.isLegalDelivery) bucket.legalBalls += 1
    if (d.batRuns === 4) bucket.fours += 1
    if (d.batRuns === 6) bucket.sixes += 1
    if (d.totalRuns === 0 && !d.wicket) bucket.dotBalls += 1
  }

  return PHASE_NAMES.map((name) => {
    const b = buckets.get(name)
    return { ...b, runRate: calculateRunRate(b.runs, b.legalBalls, ballsPerOver) }
  })
}
