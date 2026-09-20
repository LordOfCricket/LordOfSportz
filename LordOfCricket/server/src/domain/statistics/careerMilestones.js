// Pure career-achievement derivation — no pg, no I/O. Every milestone is a
// deterministic threshold over the SAME finalized-match aggregates
// statistics.service.js already computes (`career.*`) plus the chronological
// per-match performance list (oldest-first) it already builds. Nothing here
// is stored; a milestone re-appears identically on every request because it
// is recomputed from authoritative finalized-match history, exactly like the
// rest of Phase 7's stats (no cache, no counters).
//
// No fabricated dates: a milestone only carries `achievedOn` when the exact
// finalized match that crossed the threshold is present in the (unbounded)
// performance list this function is handed. Career-total fielding milestones
// have no per-match source in that list, so they never carry a date.

const APPEARANCE_TARGETS = [1, 10, 25, 50, 100]
const RUNS_TARGETS = [100, 500, 1000, 2500]
const WICKETS_TARGETS = [10, 25, 50, 100]
const CATCH_TARGETS = [10, 25, 50]

function battedRuns(perf) {
  return perf && perf.batting && perf.batting.didBat ? perf.batting.runs : 0
}
function tookWickets(perf) {
  return perf && perf.bowling && perf.bowling.didBowl ? perf.bowling.wickets : 0
}
function matchRef(perf) {
  return perf ? { matchId: perf.matchId, date: perf.date, opponent: perf.opponent } : null
}

/** First match (chronological) where the running total first reaches `target`. */
function crossingMatch(chrono, valueOf, target) {
  let running = 0
  for (const perf of chrono) {
    running += valueOf(perf)
    if (running >= target) return matchRef(perf)
  }
  return null
}

function firstMatchWhere(chrono, predicate) {
  for (const perf of chrono) if (predicate(perf)) return matchRef(perf)
  return null
}

function threshold({ id, category, title, description, value, target, achievedOn }) {
  const achieved = value >= target
  return { id, category, title, description, value, target, achieved, achievedOn: achieved ? achievedOn : null }
}

/**
 * @param {object} career - the `career` block from getPlayerCareerStats
 * @param {Array} chronoPerformances - the FULL per-match performance list, OLDEST-FIRST
 * @returns {{ earned: object[], next: object|null }}
 */
export function computeCareerAchievements({ career, chronoPerformances = [] } = {}) {
  const chrono = chronoPerformances
  const all = []

  for (const t of APPEARANCE_TARGETS) {
    all.push(
      threshold({
        id: `appearances-${t}`,
        category: 'appearance',
        title: t === 1 ? 'Debut' : `${t} Matches`,
        description: t === 1 ? 'Played a first finalized LOC match' : `Played ${t} finalized LOC matches`,
        value: career.matches,
        target: t,
        achievedOn: matchRef(chrono[t - 1]),
      })
    )
  }

  for (const t of RUNS_TARGETS) {
    all.push(
      threshold({
        id: `runs-${t}`,
        category: 'batting',
        title: `${t.toLocaleString('en-US')} Career Runs`,
        description: `Scored ${t.toLocaleString('en-US')} runs across finalized matches`,
        value: career.batting.runs,
        target: t,
        achievedOn: crossingMatch(chrono, battedRuns, t),
      })
    )
  }

  for (const t of WICKETS_TARGETS) {
    all.push(
      threshold({
        id: `wickets-${t}`,
        category: 'bowling',
        title: `${t} Career Wickets`,
        description: `Took ${t} wickets across finalized matches`,
        value: career.bowling.wickets,
        target: t,
        achievedOn: crossingMatch(chrono, tookWickets, t),
      })
    )
  }

  for (const t of CATCH_TARGETS) {
    all.push(
      threshold({
        id: `catches-${t}`,
        category: 'fielding',
        title: `${t} Catches`,
        description: `Held ${t} catches across finalized matches`,
        value: career.fielding.catches,
        target: t,
        achievedOn: null,
      })
    )
  }

  const fiftyPlus = career.batting.fifties + career.batting.hundreds
  all.push(
    threshold({
      id: 'first-fifty',
      category: 'batting',
      title: 'First Half-Century',
      description: 'Passed 50 in a single finalized innings',
      value: fiftyPlus,
      target: 1,
      achievedOn: firstMatchWhere(chrono, (p) => battedRuns(p) >= 50),
    })
  )
  all.push(
    threshold({
      id: 'first-hundred',
      category: 'batting',
      title: 'First Century',
      description: 'Passed 100 in a single finalized innings',
      value: career.batting.hundreds,
      target: 1,
      achievedOn: firstMatchWhere(chrono, (p) => battedRuns(p) >= 100),
    })
  )
  all.push(
    threshold({
      id: 'five-wicket-haul',
      category: 'bowling',
      title: 'Five-Wicket Haul',
      description: 'Took 5+ wickets in a single finalized innings',
      value: career.bowling.fiveWicketHauls,
      target: 1,
      achievedOn: firstMatchWhere(chrono, (p) => tookWickets(p) >= 5),
    })
  )

  const earned = all.filter((a) => a.achieved)
  // The single closest un-earned milestone the player has real progress
  // toward (value > 0) — an honest "what's next", never a wall of locked
  // badges. null when there's nothing in progress.
  const next =
    all
      .filter((a) => !a.achieved && a.value > 0)
      .sort((a, b) => b.value / b.target - a.value / a.target)[0] || null

  return { earned, next }
}
