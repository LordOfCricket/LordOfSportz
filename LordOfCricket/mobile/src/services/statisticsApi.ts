import api from './api'
import { TopUmpire } from '../types'

// Official statistics client — leaderboards, player search, public profile.
// Every number is derived server-side from finalized PostgreSQL match history
// on each request (statistics.service.js). Nothing is aggregated or cached
// on the client. All endpoints here are public (no auth), consistent with
// the public-read posture the website's own statisticsApi.js already uses.

// --- Leaderboards (GET /stats/leaderboards/:metric) -------------------------
// Mirrors the website's fetchLeaderboard exactly (client/src/services/
// statisticsApi.js). The response shape is statistics.service.js#getLeaderboard
// -> statistics.controller.js#getLeaderboard (values rounded at the HTTP
// boundary only).

// A leaderboard `value` is usually a number, but two metrics return an
// object: `highest-score` -> { runs, notOut } and `best-bowling` ->
// { wickets, runs }. Callers format via formatLeaderboardValue below.
export type LeaderboardValue =
  | number
  | null
  | { runs: number; notOut: boolean }
  | { wickets: number; runs: number }

export interface LeaderboardSecondary {
  matches?: number
  innings?: number
  average?: number | null
  strikeRate?: number | null
  economy?: number | null
  catches?: number
  runOuts?: number
  stumpings?: number
}

export interface LeaderboardItem {
  rank: number
  value: LeaderboardValue
  secondary?: LeaderboardSecondary
  player: {
    publicPlayerId: string
    name: string
    role: string | null
  }
}

export interface LeaderboardResponse {
  metric: string
  title: string
  category: 'batting' | 'bowling' | 'fielding'
  unit: string
  direction: 'asc' | 'desc'
  qualification: {
    minInnings?: number
    minDismissals?: number
    minBallsFaced?: number
    minWickets?: number
    minEquivalentOvers?: number
  } | null
  pagination: { limit: number; offset: number; total: number }
  items: LeaderboardItem[]
}

export interface LeaderboardParams {
  limit?: number
  offset?: number
  role?: string
  teamId?: number
}

/**
 * GET /stats/leaderboards/:metric
 * Same public leaderboard endpoint the website's Leaderboards page and the
 * mobile home Hall of Fame / Next Generation sections use. `role` filters by
 * the player's current playing role; `teamId` by their current team. Rank is
 * assigned server-side over the full qualified set before pagination, so
 * page 2 correctly starts at `offset + 1`.
 */
export async function fetchLeaderboard(
  metric: string,
  params: LeaderboardParams = {}
): Promise<LeaderboardResponse> {
  const response = await api.get<LeaderboardResponse>(`/stats/leaderboards/${metric}`, { params })
  return response.data
}

/** Display helper — matches the website's LeaderboardRow/Podium formatting. */
export function formatLeaderboardValue(value: LeaderboardValue): string {
  if (value == null) return '—'
  if (typeof value === 'number') return String(value)
  if ('wickets' in value) return `${value.wickets}/${value.runs}`
  return `${value.runs}${value.notOut ? '*' : ''}`
}

// --- LOC Cricket Records (GET /stats/records) -----------------------------
// Match & team records across all finalized matches — the team/match-side
// counterpart to the per-player leaderboards above. Same public endpoint and
// shape the website's RecordsPage.jsx uses (statistics.service.js#
// getCricketRecords). Every runs/wickets/margin is an authoritative
// innings.runs / matches.result_margin value; nothing is computed on the
// client. Empty arrays => honest "no records yet" state.

export interface RecordTeamRef {
  id: number
  name: string
  shortName: string | null
}

export interface TeamTotalRecord {
  runs: number
  wickets: number
  legalBalls: number
  team: RecordTeamRef | null
  opponent: RecordTeamRef | null
  matchId: number
  matchDate: string
}

export interface MatchAggregateRecord {
  totalRuns: number
  teamA: RecordTeamRef | null
  teamB: RecordTeamRef | null
  matchId: number
  matchDate: string
}

export interface VictoryMarginRecord {
  margin: number
  marginUnit: 'runs' | 'wickets'
  winner: RecordTeamRef | null
  loser: RecordTeamRef | null
  resultText: string | null
  matchId: number
  matchDate: string
}

export interface SuccessfulChaseRecord {
  runs: number
  wickets: number
  legalBalls: number
  chaser: RecordTeamRef | null
  defender: RecordTeamRef | null
  matchId: number
  matchDate: string
}

export interface CricketRecords {
  highestTeamTotals: TeamTotalRecord[]
  highestMatchAggregates: MatchAggregateRecord[]
  biggestWinsByRuns: VictoryMarginRecord[]
  biggestWinsByWickets: VictoryMarginRecord[]
  highestSuccessfulChases: SuccessfulChaseRecord[]
}

export async function fetchCricketRecords(): Promise<CricketRecords> {
  const response = await api.get<CricketRecords>('/stats/records')
  return response.data
}

// --- Top umpires (GET /stats/top-umpires) ---------------------------------
// Public umpire leaderboard (umpireLeaderboard.service.js#getTopUmpires),
// the same endpoint the website's Ground Owner "Browse Umpires" page uses.
export interface TopUmpiresResponse {
  items: TopUmpire[]
  total: number
  limit: number
  offset: number
}

export async function fetchTopUmpires(limit = 20, offset = 0): Promise<TopUmpiresResponse> {
  const response = await api.get<TopUmpiresResponse>('/stats/top-umpires', { params: { limit, offset } })
  return response.data
}
