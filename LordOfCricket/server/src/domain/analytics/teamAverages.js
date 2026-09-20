// Phase 17 — average innings score/conceded. `runsList` is each eligible
// finalized innings' REAL FINAL runs total (including a successful chase
// completed in fewer overs/wickets remaining — that is a complete, valid
// innings result, not an "incomplete" one; nothing here extrapolates or
// projects a score for it — Part 19).

export function computeAverageInnings(runsList) {
  if (runsList.length === 0) return null
  return runsList.reduce((s, r) => s + r, 0) / runsList.length
}
