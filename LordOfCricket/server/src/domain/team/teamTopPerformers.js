// Phase 10 Part 2 — pick the team's all-time top run scorer / wicket taker
// from already-aggregated per-player totals (Part 41: all-time TEAM
// representation, including players who have since transferred away — the
// caller is responsible for scoping the underlying performances to this
// team's historical match_players rows, never a player's CURRENT team).
// Pure, no I/O. Tie-break by publicPlayerId ascending — same deterministic
// convention Phase 8's ranking.js already uses for leaderboard ties.

function pickTop(entries, valueOf) {
  let best = null
  for (const entry of entries) {
    const value = valueOf(entry)
    if (value == null || value <= 0) continue
    if (!best || value > valueOf(best) || (value === valueOf(best) && entry.player.publicPlayerId < best.player.publicPlayerId)) {
      best = entry
    }
  }
  return best
}

/** entries: [{ player: {publicPlayerId, name}, batting: aggregateBatting() result }] */
export function pickTopRunScorer(entries) {
  const best = pickTop(entries, (e) => e.batting.runs)
  return best ? { player: best.player, runs: best.batting.runs, average: best.batting.average, strikeRate: best.batting.strikeRate } : null
}

/** entries: [{ player: {publicPlayerId, name}, bowling: aggregateBowling() result }] */
export function pickTopWicketTaker(entries) {
  const best = pickTop(entries, (e) => e.bowling.wickets)
  return best ? { player: best.player, wickets: best.bowling.wickets, economy: best.bowling.economy, average: best.bowling.average } : null
}
