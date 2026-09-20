// Standings sort — centralized (Part 28) so no UI component or service ever
// re-implements the tie-break order.
//
// 1. Points DESC
// 2. NRR DESC
// 3. Wins DESC
// 4. teamId ASC (deterministic final tie-break — no head-to-head rule in V1)

/**
 * @param {Array<{teamId, teamName, played, won, lost, tied, noResult, points, nrr}>} rows
 */
export function sortStandings(rows) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.nrr - a.nrr || b.won - a.won || a.teamId - b.teamId)
  return sorted.map((row, i) => ({ ...row, position: i + 1 }))
}
