import api from './api'
import { CareerStats } from '../types'

// Advanced Cricket Analytics + Player Comparison client. Both endpoints are
// public GETs (same posture as the public player profile / stats endpoints)
// and are the exact same endpoints the website consumes
// (client/src/services/analyticsApi.js):
//   - GET /players/:publicPlayerId/analytics   -> playerAnalytics.service.js
//   - GET /players/compare?p1=&p2=             -> comparisonAnalytics.service.js
// Every metric is deterministic and derived from finalized match history.
// No composite rating / winner is ever computed server-side or here.

// --- Player Analytics -----------------------------------------------------

export interface AnalyticsTrendPoint {
  matchId: number
  date: string
  opponent: string
  runs?: number
  balls?: number
  strikeRate?: number | null
  wickets?: number
  runsConceded?: number
  legalBalls?: number
  economy?: number | null
}

export interface AnalyticsRecentFormEntry {
  matchId: number
  date: string
  opponent: string
  won: boolean | null
  batting: { runs: number; balls: number; strikeRate: number | null } | null
  bowling: { wickets: number; runsConceded: number; legalBalls: number; economy: number | null } | null
}

export interface BattingConsistency {
  innings: number
  meanRuns: number | null
  medianRuns: number | null
  thirtyPlusCount: number
  fiftyPlusCount: number
  dismissals: number
  notOuts: number
}

export interface BoundaryAnalysis {
  fours: number
  sixes: number
  boundaryRuns: number
  boundaryRunsPercentage: number | null
}

export interface DotBallAnalysis {
  batting: { dots: number; ballsFaced: number; dotBallPercentage: number | null }
  bowling: { dots: number; legalBalls: number; dotBallPercentage: number | null }
}

export interface DismissalBreakdownEntry {
  type: string
  count: number
}

export interface TournamentBreakdown {
  tournamentId: number
  publicTournamentId: string
  name: string
  matches: number
  batting: {
    innings: number
    runs: number
    average: number | null
    strikeRate: number | null
    highestScore: { runs: number; notOut: boolean } | null
    fours: number
    sixes: number
    fifties: number
    hundreds: number
  }
  bowling: {
    innings: number
    wickets: number
    runsConceded: number
    average: number | null
    economy: number | null
    bestBowling: { wickets: number; runs: number } | null
  }
}

// Career vs Recent — both blocks are the SAME aggregateBatting /
// aggregateBowling shape the career-stats endpoint returns (one formula).
export interface CvrSide {
  matches: number
  batting: CareerStats['batting']
  bowling: CareerStats['bowling']
}

export interface PlayerAnalytics {
  player: { publicPlayerId: string; name: string; role: string | null }
  recentMatchesConsidered: number
  recentForm: AnalyticsRecentFormEntry[]
  battingTrend: AnalyticsTrendPoint[]
  bowlingTrend: AnalyticsTrendPoint[]
  consistency: BattingConsistency
  boundaryAnalysis: BoundaryAnalysis
  careerVsRecent: { recentMatches: number; career: CvrSide; recent: CvrSide }
  dotBallAnalysis: DotBallAnalysis
  dismissalBreakdown: DismissalBreakdownEntry[]
  tournamentBreakdown: TournamentBreakdown | null
}

/**
 * GET /players/:publicPlayerId/analytics
 * `recent` (server-clamped to 1..20, default 5) controls the trend window.
 */
export async function fetchPlayerAnalytics(
  publicPlayerId: string,
  params: { recent?: number; tournamentId?: number } = {}
): Promise<PlayerAnalytics> {
  const response = await api.get<PlayerAnalytics>(`/players/${publicPlayerId}/analytics`, { params })
  return response.data
}

// --- Player Comparison --------------------------------------------------

export interface ComparisonSide {
  player: { id: number; publicPlayerId: string; name: string; role: string | null }
  career: CareerStats
}

export interface PlayerComparison {
  playerA: ComparisonSide
  playerB: ComparisonSide
}

/**
 * GET /players/compare?p1=&p2=
 * Server rejects (400) two equal ids or a missing id, and 404s an id that
 * doesn't resolve. Returns full-precision career stats for both players
 * side by side — no winner, no composite score.
 */
export async function fetchPlayerComparison(p1: string, p2: string): Promise<PlayerComparison> {
  const response = await api.get<PlayerComparison>('/players/compare', { params: { p1, p2 } })
  return response.data
}

// --- Player Head-to-Head ----------------------------------------------
// Real batter-vs-bowler ENCOUNTERS in the finalized matches where both
// players appeared — distinct from fetchPlayerComparison (career totals).

export interface H2HBatting {
  runs: number
  ballsFaced: number
  fours: number
  sixes: number
  dots: number
  dismissals: number
  average: number | null
  strikeRate: number | null
}
export interface H2HBowling {
  runsConceded: number
  legalBalls: number
  wickets: number
  dots: number
  economy: number | null
  average: number | null
  strikeRate: number | null
}
export interface H2HMeeting {
  matchId: number
  date: string
  teamAName: string
  teamBName: string
  resultType: string | null
  winnerTeamId: number | null
  resultText: string | null
  playerATeam: string | null
  playerBTeam: string | null
}
export interface PlayerHeadToHead {
  playerA: { publicPlayerId: string; name: string; role: string | null }
  playerB: { publicPlayerId: string; name: string; role: string | null }
  matchesPlayed: number
  meetings: H2HMeeting[]
  aVsB: { batting: H2HBatting; bowling: H2HBowling }
  bVsA: { batting: H2HBatting; bowling: H2HBowling }
}

export async function fetchPlayerHeadToHead(p1: string, p2: string): Promise<PlayerHeadToHead> {
  const response = await api.get<PlayerHeadToHead>('/players/head-to-head', { params: { p1, p2 } })
  return response.data
}

// --- Team Comparison ---------------------------------------------------

export interface TeamComparisonRecord {
  matches: number
  wins: number
  losses: number
  ties: number
  noResults: number
  winPercentage: number | null
}

export interface TeamComparisonSide {
  team: { id: number; name: string; shortName: string; logoUrl: string | null }
  record: TeamComparisonRecord
  averageScore: number | null
}

export interface HeadToHeadMeeting {
  matchId: number
  date: string
  winnerTeamId: number | null
  resultType: string
  resultMargin: number | null
}

export interface HeadToHead {
  matchesPlayed: number
  teamAWins: number
  teamBWins: number
  ties: number
  noResults: number
  recentMeetings: HeadToHeadMeeting[]
}

export interface TeamComparison {
  teamA: TeamComparisonSide
  teamB: TeamComparisonSide
  headToHead: HeadToHead
}

/**
 * GET /teams/compare?t1=&t2=
 * Numeric team ids. Server rejects (400) two equal ids and 404s an id that
 * doesn't resolve. Record + head-to-head history side by side — no winner.
 */
export async function fetchTeamComparison(t1: number | string, t2: number | string): Promise<TeamComparison> {
  const response = await api.get<TeamComparison>('/teams/compare', { params: { t1, t2 } })
  return response.data
}
