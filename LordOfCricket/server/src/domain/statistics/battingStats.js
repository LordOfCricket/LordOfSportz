// Pure batting-statistics math — no pg, no I/O. Consumes the SAME per-innings
// replayed state the live scorer already trusts (state.batsmen[matchPlayerId]
// from replayInnings()), so a batsman's runs/balls/fours/sixes/dismissal here
// are never a second, independently-derived interpretation of the delivery
// log — see replay.js's updateBatsman for the one true definition (e.g. a
// clean dismissal zeroes the ball's credited runs, a wide never counts as a
// ball faced).

/** null = the player never entered this innings (DNB) — distinct from a 0-run innings. */
export function extractBattingPerformance(state, matchPlayerId) {
  const stat = state.batsmen[matchPlayerId]
  if (!stat) return null
  return { runs: stat.runs, balls: stat.balls, fours: stat.fours, sixes: stat.sixes, notOut: !stat.out }
}

export function battingStrikeRate(runs, balls) {
  if (!balls) return null
  return (runs / balls) * 100
}

/**
 * Career aggregation over every batting innings the player has ever played in
 * a FINALIZED match (caller is responsible for that filter — this function
 * just folds whatever performance list it's given).
 *
 * Average is runs/dismissals, never runs/innings (not-outs would otherwise
 * silently deflate it) — null rather than a fake Infinity when the player has
 * never been dismissed. Highest score is structured {runs, notOut} rather
 * than a "84*"-style string, and prefers the not-out version when two innings
 * tie on runs (a 42* is at least as good as a 42).
 */
export function aggregateBatting(performances) {
  const innings = performances.length
  const notOuts = performances.filter((p) => p.notOut).length
  const dismissals = innings - notOuts
  const runs = performances.reduce((sum, p) => sum + p.runs, 0)
  const ballsFaced = performances.reduce((sum, p) => sum + p.balls, 0)
  const fours = performances.reduce((sum, p) => sum + p.fours, 0)
  const sixes = performances.reduce((sum, p) => sum + p.sixes, 0)
  const ducks = performances.filter((p) => p.runs === 0 && !p.notOut).length

  // Non-overlapping ranges (a 100 is not also counted as a 50) so the three
  // counts can be summed/compared without double-counting the same innings.
  const thirties = performances.filter((p) => p.runs >= 30 && p.runs < 50).length
  const fifties = performances.filter((p) => p.runs >= 50 && p.runs < 100).length
  const hundreds = performances.filter((p) => p.runs >= 100).length

  let highestScore = null
  for (const p of performances) {
    if (!highestScore || p.runs > highestScore.runs || (p.runs === highestScore.runs && p.notOut && !highestScore.notOut)) {
      highestScore = { runs: p.runs, notOut: p.notOut }
    }
  }

  return {
    innings,
    notOuts,
    runs,
    ballsFaced,
    highestScore,
    average: dismissals > 0 ? runs / dismissals : null,
    strikeRate: battingStrikeRate(runs, ballsFaced),
    fours,
    sixes,
    thirties,
    fifties,
    hundreds,
    ducks,
  }
}
