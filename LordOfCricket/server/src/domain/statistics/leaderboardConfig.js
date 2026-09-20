// Central leaderboard metric registry + qualification rules (Part 19/23).
// Every leaderboard (route, service, frontend copy) reads from THIS file —
// nowhere else defines a metric, a qualification threshold, or a sort order.
// Pure config + pure functions; no pg, no I/O.

// Club/local-scale starting thresholds (Part 14/16/17), deliberately NOT
// professional/international numbers. Centralized here — nothing else
// hardcodes these numbers.
export const LEADERBOARD_QUALIFICATIONS = Object.freeze({
  'batting-average': { minInnings: 3, minDismissals: 1 },
  'batting-strike-rate': { minBallsFaced: 30 },
  'bowling-average': { minWickets: 3 },
  economy: { minEquivalentOvers: 3 },
})

function battingSecondary(c) {
  return { matches: c.matches, innings: c.batting.innings, average: c.batting.average, strikeRate: c.batting.strikeRate }
}
function bowlingSecondary(c) {
  return { matches: c.matches, innings: c.bowling.innings, average: c.bowling.average, economy: c.bowling.economy }
}
function fieldingSecondary(c) {
  return { matches: c.matches, catches: c.fielding.catches, runOuts: c.fielding.runOuts, stumpings: c.fielding.stumpings }
}

// Every metric: title (UI heading), category (tab grouping), unit (display
// suffix), value (what's actually ranked, for display), qualifies (boolean
// gate — raw counting stats have no threshold beyond "greater than zero" so
// a career with none of that stat doesn't clutter the board), sortKey (see
// ranking.js — array of HIGHER-IS-BETTER numbers; metrics where a lower raw
// value is better, e.g. bowling average/economy, negate it here so the
// generic descending comparator still works untouched), secondary (extra
// context fields for the UI row).
export const LEADERBOARD_METRICS = Object.freeze({
  runs: {
    title: 'Top Run Scorers',
    category: 'batting',
    unit: 'runs',
    value: (c) => c.batting.runs,
    qualifies: (c) => c.batting.runs > 0,
    // Part 20: runs DESC, then average DESC, then fewer innings, then stable id.
    sortKey: (c) => [c.batting.runs, c.batting.average, c.batting.innings != null ? -c.batting.innings : null],
    secondary: battingSecondary,
  },
  sixes: {
    title: 'Most Sixes',
    category: 'batting',
    unit: 'sixes',
    value: (c) => c.batting.sixes,
    qualifies: (c) => c.batting.sixes > 0,
    // Part 20: sixes DESC, then runs DESC, then stable id.
    sortKey: (c) => [c.batting.sixes, c.batting.runs],
    secondary: battingSecondary,
  },
  fours: {
    title: 'Most Fours',
    category: 'batting',
    unit: 'fours',
    value: (c) => c.batting.fours,
    qualifies: (c) => c.batting.fours > 0,
    sortKey: (c) => [c.batting.fours, c.batting.runs],
    secondary: battingSecondary,
  },
  fifties: {
    title: 'Most 50s',
    category: 'batting',
    unit: '50s',
    value: (c) => c.batting.fifties,
    qualifies: (c) => c.batting.fifties > 0,
    sortKey: (c) => [c.batting.fifties, c.batting.runs],
    secondary: battingSecondary,
  },
  hundreds: {
    title: 'Most 100s',
    category: 'batting',
    unit: '100s',
    value: (c) => c.batting.hundreds,
    qualifies: (c) => c.batting.hundreds > 0,
    sortKey: (c) => [c.batting.hundreds, c.batting.runs],
    secondary: battingSecondary,
  },
  // Homepage redesign Stage 2 — "Maximum Score" (Hall of Fame). A single
  // best-innings figure, not a career total — the batting-side twin of
  // 'best-bowling' below. c.batting.highestScore ({runs, notOut}) already
  // exists (aggregateBatting's own per-innings MAX over the same
  // battingPerfs array `runs` is summed from) — no new query, no new
  // replay logic, just registering it here.
  'highest-score': {
    title: 'Highest Score',
    category: 'batting',
    unit: 'runs',
    value: (c) => c.batting.highestScore,
    // A highest score of 0 (never got off the mark) isn't a real
    // achievement — mirrors best-bowling's "wickets >= 1" floor.
    qualifies: (c) => c.batting.highestScore != null && c.batting.highestScore.runs > 0,
    // runs DESC, then not-out preferred on a tie — mirrors
    // aggregateBatting's own tie-break rule exactly (battingStats.js).
    sortKey: (c) => [c.batting.highestScore?.runs, c.batting.highestScore?.notOut ? 1 : 0],
    secondary: battingSecondary,
  },
  'batting-average': {
    title: 'Best Batting Average',
    category: 'batting',
    unit: 'avg',
    value: (c) => c.batting.average,
    qualification: LEADERBOARD_QUALIFICATIONS['batting-average'],
    qualifies: (c) => {
      const q = LEADERBOARD_QUALIFICATIONS['batting-average']
      const dismissals = c.batting.innings - c.batting.notOuts
      return c.batting.innings >= q.minInnings && dismissals >= q.minDismissals
    },
    // Part 57: never-dismissed (null average) can never qualify anyway, but
    // the sort key itself must still never treat null as "infinitely good".
    sortKey: (c) => [c.batting.average, c.batting.runs],
    secondary: battingSecondary,
  },
  'batting-strike-rate': {
    title: 'Best Strike Rate',
    category: 'batting',
    unit: 'SR',
    value: (c) => c.batting.strikeRate,
    qualification: LEADERBOARD_QUALIFICATIONS['batting-strike-rate'],
    qualifies: (c) => c.batting.ballsFaced >= LEADERBOARD_QUALIFICATIONS['batting-strike-rate'].minBallsFaced,
    sortKey: (c) => [c.batting.strikeRate, c.batting.runs],
    secondary: battingSecondary,
  },
  wickets: {
    title: 'Top Wicket Takers',
    category: 'bowling',
    unit: 'wickets',
    value: (c) => c.bowling.wickets,
    qualifies: (c) => c.bowling.wickets > 0,
    // Part 20: wickets DESC, then bowling average ASC, then economy ASC, then stable id.
    // (ASC = "lower is better" -> negated so the generic comparator still sorts descending.)
    sortKey: (c) => [c.bowling.wickets, c.bowling.average != null ? -c.bowling.average : null, c.bowling.economy != null ? -c.bowling.economy : null],
    secondary: bowlingSecondary,
  },
  maidens: {
    title: 'Most Maidens',
    category: 'bowling',
    unit: 'maidens',
    value: (c) => c.bowling.maidens,
    qualifies: (c) => c.bowling.maidens > 0,
    sortKey: (c) => [c.bowling.maidens, c.bowling.wickets],
    secondary: bowlingSecondary,
  },
  'bowling-average': {
    title: 'Best Bowling Average',
    category: 'bowling',
    unit: 'avg',
    value: (c) => c.bowling.average,
    qualification: LEADERBOARD_QUALIFICATIONS['bowling-average'],
    qualifies: (c) => c.bowling.wickets >= LEADERBOARD_QUALIFICATIONS['bowling-average'].minWickets,
    sortKey: (c) => [c.bowling.average != null ? -c.bowling.average : null, c.bowling.wickets],
    secondary: bowlingSecondary,
  },
  economy: {
    title: 'Best Economy',
    category: 'bowling',
    unit: 'econ',
    value: (c) => c.bowling.economy,
    qualification: LEADERBOARD_QUALIFICATIONS.economy,
    qualifies: (c) => c.bowling.equivalentOvers >= LEADERBOARD_QUALIFICATIONS.economy.minEquivalentOvers,
    sortKey: (c) => [c.bowling.economy != null ? -c.bowling.economy : null, c.bowling.wickets],
    secondary: bowlingSecondary,
  },
  'best-bowling': {
    title: 'Best Bowling Figures',
    category: 'bowling',
    unit: 'figures',
    value: (c) => c.bowling.bestBowling,
    // A "best figures" leaderboard is only meaningful for an actual wicket —
    // 0/4 is not a bowling achievement, so at least 1 wicket is required.
    qualifies: (c) => c.bowling.bestBowling != null && c.bowling.bestBowling.wickets >= 1,
    // Part 61: wickets DESC, then runs ASC (fewer is better -> negated).
    sortKey: (c) => [c.bowling.bestBowling?.wickets, c.bowling.bestBowling ? -c.bowling.bestBowling.runs : null],
    secondary: bowlingSecondary,
  },
  catches: {
    title: 'Most Catches',
    category: 'fielding',
    unit: 'catches',
    value: (c) => c.fielding.catches,
    qualifies: (c) => c.fielding.catches > 0,
    // Part 20: catches DESC, then matches ASC (documented choice: fewer matches
    // for the same catch count implies a higher catch rate), then stable id.
    sortKey: (c) => [c.fielding.catches, c.matches != null ? -c.matches : null],
    secondary: fieldingSecondary,
  },
  'run-outs': {
    title: 'Most Run Outs',
    category: 'fielding',
    unit: 'run outs',
    value: (c) => c.fielding.runOuts,
    qualifies: (c) => c.fielding.runOuts > 0,
    sortKey: (c) => [c.fielding.runOuts, c.matches != null ? -c.matches : null],
    secondary: fieldingSecondary,
  },
  stumpings: {
    title: 'Most Stumpings',
    category: 'fielding',
    unit: 'stumpings',
    value: (c) => c.fielding.stumpings,
    qualifies: (c) => c.fielding.stumpings > 0,
    sortKey: (c) => [c.fielding.stumpings, c.matches != null ? -c.matches : null],
    secondary: fieldingSecondary,
  },
})

export function isValidMetric(metric) {
  return Object.prototype.hasOwnProperty.call(LEADERBOARD_METRICS, metric)
}
