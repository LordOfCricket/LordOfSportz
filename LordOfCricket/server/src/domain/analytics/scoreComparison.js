// Phase 17 — reshapes two innings' score progressions into a worm-chart-ready
// side-by-side series. Pure reshaping only (no new cricket math — reuses
// whatever buildScoreProgression already computed). Innings of different
// lengths are handled by simply returning each series at its own real
// length; nothing here fabricates a missing delivery/over for the shorter one.

export function buildScoreComparisonSeries(progressionA, teamAId, progressionB, teamBId) {
  return {
    teamA: { teamId: teamAId, points: progressionA.map((p) => ({ over: p.over, cumulativeRuns: p.cumulativeRuns, cumulativeWickets: p.cumulativeWickets })) },
    teamB: { teamId: teamBId, points: progressionB.map((p) => ({ over: p.over, cumulativeRuns: p.cumulativeRuns, cumulativeWickets: p.cumulativeWickets })) },
  }
}
