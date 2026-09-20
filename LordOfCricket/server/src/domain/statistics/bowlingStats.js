// Pure bowling-statistics math — no pg, no I/O. Consumes state.bowlers[...]
// from the same replayInnings() result the live scorer trusts, plus the
// enriched state.deliveries array (also produced by replay) for maiden-over
// detection, which nothing else in the app currently needs.

/**
 * A maiden is an over in which this bowler bowled every legal delivery and
 * conceded zero BOWLER-attributable runs across the whole over — byes/leg-byes
 * are excluded (they're the fielding side's runs, not the bowler's), matching
 * exactly the runsConceded formula replay.js's updateBowler already uses
 * (totalRuns minus extra.runs). Requires the over to be full-length AND
 * entirely bowled by this bowler; a partial over (innings ended mid-over)
 * never counts.
 */
export function computeMaidens(deliveries, matchPlayerId, ballsPerOver) {
  const overs = new Map()
  for (const d of deliveries) {
    if (d.voided || d.isDeadBall || d.bowlerMatchPlayerId !== matchPlayerId) continue
    const overIndex = d.over - 1
    const bucket = overs.get(overIndex) || { legalBalls: 0, runsConceded: 0 }
    if (d.isLegalDelivery) bucket.legalBalls += 1
    bucket.runsConceded += d.totalRuns - (d.extra?.runs || 0)
    overs.set(overIndex, bucket)
  }
  let maidens = 0
  for (const { legalBalls, runsConceded } of overs.values()) {
    if (legalBalls === ballsPerOver && runsConceded === 0) maidens += 1
  }
  return maidens
}

/** null = the player never bowled a single delivery (legal or not) in this innings. */
export function extractBowlingPerformance(state, matchPlayerId, ballsPerOver) {
  const stat = state.bowlers[matchPlayerId]
  if (!stat) return null
  return {
    legalBalls: stat.legalBalls,
    runs: stat.runs,
    wickets: stat.wickets,
    maidens: computeMaidens(state.deliveries, matchPlayerId, ballsPerOver),
    ballsPerOver,
  }
}

export function bowlingEconomy(runsConceded, legalBalls, ballsPerOver) {
  if (!legalBalls) return null
  return runsConceded / (legalBalls / ballsPerOver)
}

/**
 * Career aggregation across bowling spells that may come from matches with
 * different balls-per-over. Workload stays an exact ball count (legalBalls —
 * never a summed/rounded overs string). Economy is normalized by converting
 * each spell to its EQUIVALENT overs under its own match's ballsPerOver before
 * summing, so a 5-ball-over spell and a 6-ball-over spell combine
 * mathematically rather than both being treated as six-ball overs.
 */
export function aggregateBowling(performances) {
  const innings = performances.length
  const legalBalls = performances.reduce((sum, p) => sum + p.legalBalls, 0)
  const runsConceded = performances.reduce((sum, p) => sum + p.runs, 0)
  const wickets = performances.reduce((sum, p) => sum + p.wickets, 0)
  const maidens = performances.reduce((sum, p) => sum + p.maidens, 0)
  const equivalentOvers = performances.reduce((sum, p) => sum + p.legalBalls / p.ballsPerOver, 0)

  let bestBowling = null
  for (const p of performances) {
    if (!bestBowling || p.wickets > bestBowling.wickets || (p.wickets === bestBowling.wickets && p.runs < bestBowling.runs)) {
      bestBowling = { wickets: p.wickets, runs: p.runs }
    }
  }

  return {
    innings,
    legalBalls,
    runsConceded,
    wickets,
    maidens,
    average: wickets > 0 ? runsConceded / wickets : null,
    economy: equivalentOvers > 0 ? runsConceded / equivalentOvers : null,
    strikeRate: wickets > 0 ? legalBalls / wickets : null,
    // Exposed (not just used internally) so Phase 8's economy-leaderboard
    // qualification can require a minimum WORKLOAD without re-deriving this
    // mixed-ballsPerOver-safe sum itself — legalBalls alone can't answer
    // "how many overs" once a career spans different formats.
    equivalentOvers,
    bestBowling,
    // "At least N" cricket convention (a 5-wicket haul is also a 3-wicket-or-
    // better performance) — deliberately not mutually exclusive, unlike the
    // batting 30/50/100 buckets.
    threeWicketHauls: performances.filter((p) => p.wickets >= 3).length,
    fourWicketHauls: performances.filter((p) => p.wickets >= 4).length,
    fiveWicketHauls: performances.filter((p) => p.wickets >= 5).length,
  }
}
