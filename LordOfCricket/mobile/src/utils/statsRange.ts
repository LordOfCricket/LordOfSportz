import { BattingStats, BowlingStats, PlayerMatchPerformance } from '../types'
import { groundTodayDateStr } from './groundTime'

// GET /me/stats (server/src/controllers/statistics.controller.js#getMyStats ->
// server/src/services/statistics.service.js#getPlayerCareerStats) has NO
// period/date/last-N query parameter — it only accepts `limit`/`offset` for
// paginating `matchHistory`, and the `career` aggregate it returns is always
// the full, unfiltered, all-time total (confirmed by reading both files).
// So "Overall" reuses that real `career` object untouched (see
// profile/index.tsx). Every other range below is a client-side aggregation
// over the real, already-fetched per-match `matchHistory.items` performances
// — using the EXACT SAME formulas as server/src/domain/statistics/
// {battingStats,bowlingStats}.js (sum raw counts first, THEN divide — never
// average of per-match rates), so a range-filtered number is honest
// arithmetic over real data, not invented behavior. This is a genuine
// backend capability gap, not a preference — see the Career Statistics
// section's implementation notes for the full explanation.
export type StatsRange = 'last-match' | 'last-10' | '1-week' | '1-month' | '1-year' | 'overall'

export const STATS_RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: 'last-match', label: 'Last Match' },
  { value: 'last-10', label: 'Last 10 Matches' },
  { value: '1-week', label: '1 Week' },
  { value: '1-month', label: '1 Month' },
  { value: '1-year', label: '1 Year' },
  { value: 'overall', label: 'Overall' },
]

export function statsRangeLabel(range: StatsRange): string {
  return STATS_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'Overall'
}

/**
 * `matches.match_date` is a `TIMESTAMP WITHOUT TIME ZONE` column
 * (server/src/config/schema.sql) whose stored digits are already
 * ground-local wall-clock digits, never a true UTC instant — this is
 * explicitly documented by server/src/domain/shared/groundTime.js's own
 * comment on `groundLocalNaiveTimestamp`. Node/pg round-trips that value as
 * `<same digits>Z` over JSON, so the correct calendar date is simply the
 * literal YYYY-MM-DD prefix of the string — applying a real timezone
 * conversion here would incorrectly shift it a second time. (Deliberately
 * different from toGroundDateStr()/groundTodayDateStr() in groundTime.ts,
 * which convert a genuine UTC instant like `new Date()` into ground-local
 * digits — "now" IS a real instant; `match.date` is not.)
 */
function matchDateOnlyStr(isoLike: string): string {
  return isoLike.slice(0, 10)
}

/** Pure YYYY-MM-DD calendar arithmetic, anchored at ground-local noon (same
 * trick as the backend's addDaysToDateStr) so the shift can never land on
 * the wrong side of a calendar-day boundary. */
function shiftDateStr(dateStr: string, unit: 'days' | 'months' | 'years', amount: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  if (unit === 'days') dt.setUTCDate(dt.getUTCDate() + amount)
  else if (unit === 'months') dt.setUTCMonth(dt.getUTCMonth() + amount)
  else dt.setUTCFullYear(dt.getUTCFullYear() + amount)
  return dt.toISOString().slice(0, 10)
}

/**
 * `items` must already be sorted newest-first (guaranteed by
 * statistics.service.js#buildMatchPerformances) and is capped at whatever
 * was fetched (GET /me/stats's own hard max is 50 — see
 * MAX_MATCH_HISTORY_LIMIT). For 1-week/1-month/1-year that cap is only a
 * real limitation if a player played more finalized matches within that
 * window than the fetch limit — not a realistic scenario for this app today,
 * but a genuine ceiling worth knowing about.
 */
export function filterPerformancesForRange(
  items: PlayerMatchPerformance[],
  range: StatsRange
): PlayerMatchPerformance[] {
  switch (range) {
    case 'last-match':
      return items.slice(0, 1)
    case 'last-10':
      return items.slice(0, 10)
    case '1-week': {
      const cutoff = shiftDateStr(groundTodayDateStr(), 'days', -7)
      return items.filter((p) => matchDateOnlyStr(p.date) >= cutoff)
    }
    case '1-month': {
      const cutoff = shiftDateStr(groundTodayDateStr(), 'months', -1)
      return items.filter((p) => matchDateOnlyStr(p.date) >= cutoff)
    }
    case '1-year': {
      const cutoff = shiftDateStr(groundTodayDateStr(), 'years', -1)
      return items.filter((p) => matchDateOnlyStr(p.date) >= cutoff)
    }
    case 'overall':
    default:
      return items
  }
}

/** Mirrors server/src/domain/statistics/battingStats.js#aggregateBatting
 * exactly, fed by real per-match performances instead of replayed innings. */
export function aggregateBattingFromPerformances(perfs: PlayerMatchPerformance[]): BattingStats {
  const batted = perfs.filter((p) => p.batting.didBat)
  const innings = batted.length
  const notOuts = batted.filter((p) => p.batting.notOut).length
  const dismissals = innings - notOuts
  const runs = batted.reduce((sum, p) => sum + (p.batting.runs ?? 0), 0)
  const ballsFaced = batted.reduce((sum, p) => sum + (p.batting.balls ?? 0), 0)
  const fours = batted.reduce((sum, p) => sum + (p.batting.fours ?? 0), 0)
  const sixes = batted.reduce((sum, p) => sum + (p.batting.sixes ?? 0), 0)
  const ducks = batted.filter((p) => (p.batting.runs ?? 0) === 0 && !p.batting.notOut).length
  const thirties = batted.filter((p) => (p.batting.runs ?? 0) >= 30 && (p.batting.runs ?? 0) < 50).length
  const fifties = batted.filter((p) => (p.batting.runs ?? 0) >= 50 && (p.batting.runs ?? 0) < 100).length
  const hundreds = batted.filter((p) => (p.batting.runs ?? 0) >= 100).length

  let highestScore: { runs: number; notOut: boolean } | null = null
  for (const p of batted) {
    const runsScored = p.batting.runs ?? 0
    const notOut = !!p.batting.notOut
    if (!highestScore || runsScored > highestScore.runs || (runsScored === highestScore.runs && notOut && !highestScore.notOut)) {
      highestScore = { runs: runsScored, notOut }
    }
  }

  return {
    innings,
    notOuts,
    runs,
    ballsFaced,
    highestScore,
    average: dismissals > 0 ? runs / dismissals : null,
    strikeRate: ballsFaced > 0 ? (runs / ballsFaced) * 100 : null,
    fours,
    sixes,
    thirties,
    fifties,
    hundreds,
    ducks,
  }
}

/** Mirrors server/src/domain/statistics/bowlingStats.js#aggregateBowling
 * exactly, fed by real per-match performances instead of replayed innings. */
export function aggregateBowlingFromPerformances(perfs: PlayerMatchPerformance[]): BowlingStats {
  const bowled = perfs.filter((p) => p.bowling.didBowl)
  const innings = bowled.length
  const legalBalls = bowled.reduce((sum, p) => sum + (p.bowling.legalBalls ?? 0), 0)
  const runsConceded = bowled.reduce((sum, p) => sum + (p.bowling.runs ?? 0), 0)
  const wickets = bowled.reduce((sum, p) => sum + (p.bowling.wickets ?? 0), 0)
  const maidens = bowled.reduce((sum, p) => sum + (p.bowling.maidens ?? 0), 0)
  const equivalentOvers = bowled.reduce((sum, p) => {
    const ballsPerOver = p.bowling.ballsPerOver
    return ballsPerOver ? sum + (p.bowling.legalBalls ?? 0) / ballsPerOver : sum
  }, 0)

  let bestBowling: { wickets: number; runs: number } | null = null
  for (const p of bowled) {
    const wicketsTaken = p.bowling.wickets ?? 0
    const runsGiven = p.bowling.runs ?? 0
    if (!bestBowling || wicketsTaken > bestBowling.wickets || (wicketsTaken === bestBowling.wickets && runsGiven < bestBowling.runs)) {
      bestBowling = { wickets: wicketsTaken, runs: runsGiven }
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
    equivalentOvers,
    bestBowling,
    threeWicketHauls: bowled.filter((p) => (p.bowling.wickets ?? 0) >= 3).length,
    fourWicketHauls: bowled.filter((p) => (p.bowling.wickets ?? 0) >= 4).length,
    fiveWicketHauls: bowled.filter((p) => (p.bowling.wickets ?? 0) >= 5).length,
  }
}

// --- Performance Insights: "best recent performance" ------------------------
// Unlike Personal Bests (career-wide, no opponent — PersonalBests carries
// only {runs, notOut}/{wickets, runs}), these surface the standout game
// within an already-range-filtered window WITH its real opponent, since
// PlayerMatchPerformance already has that field. Same tie-break rules as
// aggregateBattingFromPerformances/aggregateBowlingFromPerformances's own
// highestScore/bestBowling above — this isn't a new formula, just the same
// max-finding logic applied while also keeping the match it came from.

export interface BestRecentBattingPerformance {
  matchId: number
  date: string
  opponent: string
  runs: number
  notOut: boolean
}

export interface BestRecentBowlingPerformance {
  matchId: number
  date: string
  opponent: string
  wickets: number
  runs: number
}

export function findBestBattingPerformance(perfs: PlayerMatchPerformance[]): BestRecentBattingPerformance | null {
  let best: BestRecentBattingPerformance | null = null
  for (const p of perfs) {
    if (!p.batting.didBat) continue
    const runs = p.batting.runs ?? 0
    const notOut = !!p.batting.notOut
    if (!best || runs > best.runs || (runs === best.runs && notOut && !best.notOut)) {
      best = { matchId: p.matchId, date: p.date, opponent: p.opponent, runs, notOut }
    }
  }
  return best
}

export function findBestBowlingPerformance(perfs: PlayerMatchPerformance[]): BestRecentBowlingPerformance | null {
  let best: BestRecentBowlingPerformance | null = null
  for (const p of perfs) {
    if (!p.bowling.didBowl) continue
    const wickets = p.bowling.wickets ?? 0
    const runs = p.bowling.runs ?? 0
    if (!best || wickets > best.wickets || (wickets === best.wickets && runs < best.runs)) {
      best = { matchId: p.matchId, date: p.date, opponent: p.opponent, wickets, runs }
    }
  }
  return best
}
