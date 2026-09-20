// Phase 17 — boundary and dot-ball analysis for a batter, derived from
// already-authoritative facts (existing fours/sixes/runs counts, and the same
// enriched delivery array replay.js already produces). No new scoring rules.

/**
 * boundaryRunsPercentage = boundaryRuns / totalRuns * 100 — the share of a
 * batter's runs that came from boundaries. null (not 0) when the batter
 * scored 0 runs, since 0/0 is undefined, not "0% boundary reliance."
 */
export function computeBoundaryAnalysis({ runs, fours, sixes }) {
  const boundaryRuns = fours * 4 + sixes * 6
  return {
    fours,
    sixes,
    boundaryRuns,
    boundaryRunsPercentage: runs > 0 ? (boundaryRuns / runs) * 100 : null,
  }
}

/**
 * A batting dot ball = a delivery this player faced (matching the EXACT
 * "ball faced" convention replay.js#updateBatsman already uses — a wide never
 * counts, a no-ball does) on which 0 runs were credited off the bat. Byes/
 * leg-byes scored on an otherwise-dot delivery still count as a batting dot —
 * the batter did not score off their own shot, which is the standard cricket
 * convention.
 */
export function countBattingDots(deliveries, matchPlayerId) {
  return deliveries.filter(
    (d) => !d.voided && !d.isDeadBall && d.strikerMatchPlayerId === matchPlayerId && d.illegal?.type !== 'wide' && d.batRuns === 0
  ).length
}

export function battingDotBallPercentage(dots, ballsFaced) {
  if (!ballsFaced) return null
  return (dots / ballsFaced) * 100
}
