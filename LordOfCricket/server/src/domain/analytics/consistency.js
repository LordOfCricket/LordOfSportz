// Phase 17 — deliberately simple, transparent batting consistency metrics.
// No composite "rating" score is ever computed (Part 14 — "do NOT invent a
// magical player rating").

function median(nums) {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** `battingPerformances`: [{runs, notOut}], most-recent-bounded window supplied by the caller. */
export function computeBattingConsistency(battingPerformances) {
  const innings = battingPerformances.length
  if (innings === 0) {
    return { innings: 0, meanRuns: null, medianRuns: null, thirtyPlusCount: 0, fiftyPlusCount: 0, dismissals: 0, notOuts: 0 }
  }
  const runsList = battingPerformances.map((p) => p.runs)
  const notOuts = battingPerformances.filter((p) => p.notOut).length
  return {
    innings,
    meanRuns: runsList.reduce((s, r) => s + r, 0) / innings,
    medianRuns: median(runsList),
    thirtyPlusCount: runsList.filter((r) => r >= 30).length,
    fiftyPlusCount: runsList.filter((r) => r >= 50).length,
    dismissals: innings - notOuts,
    notOuts,
  }
}
