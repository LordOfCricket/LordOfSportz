import api from './api'
import { Team, Match } from '../types'

// GET /teams/:id/profile response (publicTeam.service.js#getPublicTeamProfile)
// — distinct from the raw `Team` row shape used by createTeam/getTeamById.
export interface TeamSquadPlayer {
  publicPlayerId: string
  name: string
  role: string | null
  battingStyle: string | null
  bowlingStyle: string | null
  photoUrl: string | null
  jerseyNumber: number | null
}

export interface TeamRecord {
  matches: number
  wins: number
  losses: number
  ties: number
  noResults: number
  // Always present on the real response (server/src/domain/team/teamRecord.js
  // #buildTeamRecord computes it unconditionally) — just never previously
  // declared here since nothing consumed it. null only when matches === 0
  // (0/0 is undefined, not "0%").
  winPercentage: number | null
}

// server/src/domain/team/teamRecord.js#buildRecentForm — newest-first,
// each entry's `result` already resolved from the TEAM's own side (W/L, or
// T/NR when the real result_type is a tie/no-result — never guessed).
export interface TeamRecentFormEntry {
  matchId: number
  result: 'W' | 'L' | 'T' | 'NR'
}

// publicTeam.service.js#getPublicTeamProfile -> buildTopPerformers.
// All-time top scorer/wicket-taker while REPRESENTING THIS TEAM (scoped by
// the historical match_players.team_id snapshot, survives transfers).
export interface TeamTopPerformers {
  topRunScorer: {
    player: { publicPlayerId: string; name: string }
    runs: number
    average: number | null
    strikeRate: number | null
  } | null
  topWicketTaker: {
    player: { publicPlayerId: string; name: string }
    wickets: number
    economy: number | null
    average: number | null
  } | null
}

export interface TeamProfileResponse {
  team: {
    id: number
    name: string
    shortName: string
    logoUrl: string | null
    registeredAt: string
  }
  squad: TeamSquadPlayer[]
  record: TeamRecord
  recentForm: TeamRecentFormEntry[]
  // These four were ALREADY returned by GET /teams/:id/profile — mobile
  // just never modelled or rendered them. `Match` is the same buildMatchCard
  // shape /matches/discover uses (MatchCard renders it, navigates to the
  // match screen on tap).
  liveMatch: Match | null
  upcomingFixtures: Match[]
  recentMatches: Match[]
  topPerformers: TeamTopPerformers
}

export async function discoverTeams(query?: string, limit = 20, offset = 0) {
  // Backend GET /teams/discover (team.controller.js#getPublicTeams) reads
  // the `search` query param — same name the website uses
  // (client/src/services/publicTeamApi.js). Sending `q` meant the
  // server-side name filter was silently ignored.
  const response = await api.get('/teams/discover', {
    params: { search: query || undefined, limit, offset },
  })
  return response.data
}

export async function getAllTeams() {
  const response = await api.get('/teams')
  return response.data
}

export async function getTeamById(teamId: number): Promise<Team> {
  const response = await api.get<Team>(`/teams/${teamId}`)
  return response.data
}

export async function getTeamProfile(teamId: number): Promise<TeamProfileResponse> {
  const response = await api.get<TeamProfileResponse>(`/teams/${teamId}/profile`)
  return response.data
}

export async function searchTeams(query: string, limit = 20, offset = 0) {
  return discoverTeams(query, limit, offset)
}

export async function getTeamMatches(teamId: number) {
  const response = await api.get(`/teams/${teamId}/matches`)
  return response.data
}

export async function getTeamPlayers(teamId: number) {
  const response = await api.get(`/teams/${teamId}/players`)
  return response.data
}

export async function createTeam(data: { name: string; short_name: string; logo_url?: string }): Promise<{ team: Team }> {
  const response = await api.post<{ team: Team }>('/teams', data)
  return response.data
}
