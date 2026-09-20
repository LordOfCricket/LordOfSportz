import api from './api'

// Tournament read client — the same public endpoints the website uses
// (client/src/services/tournamentApi.js). Every number (standings, NRR,
// points, top scorers) is computed server-side and returned ready to
// display; nothing is derived on the client. Organizer/staff mutations are
// intentionally NOT included here — the mobile app is player/fan-facing and
// the website already gates those to role === 'staff'.

export type TournamentFormat = 'LEAGUE' | 'GROUPS_KNOCKOUT' | 'KNOCKOUT'
export type TournamentStatus = 'DRAFT' | 'REGISTRATION' | 'SCHEDULED' | 'LIVE' | 'COMPLETED'
export type TournamentCategory = 'LIVE' | 'UPCOMING' | 'COMPLETED'

export interface TournamentSummary {
  publicTournamentId: string
  name: string
  description: string | null
  format: TournamentFormat
  status: TournamentStatus
  startDate: string
  endDate: string
  oversPerInnings: number | null
  ballsPerOver: number
  maxTeams: number
  maxSquadSize: number
  championTeamId: number | null
  championTeamName?: string
  teamCount?: number
  createdAt: string
}

export interface TournamentListResponse {
  pagination: { limit: number; offset: number; total: number }
  items: TournamentSummary[]
}

export interface TournamentTeam {
  id: number
  teamId: number
  teamName: string
  teamShort: string
  teamLogo: string | null
  groupName: string | null
}

export interface TournamentSquadPlayer {
  id: number
  tournamentTeamId: number
  playerId: number
  name: string
  publicPlayerId: string
  role: string | null
  photoUrl: string | null
}

export interface TournamentFixture {
  id: number
  stage: string
  groupName: string | null
  round: number | null
  bracketSlot: number | null
  fixtureNumber: number | null
  teamA: { id: number | null; name: string | null; short: string | null; logo: string | null }
  teamB: { id: number | null; name: string | null; short: string | null; logo: string | null }
  matchId: number | null
  matchStatus: string | null
  matchDate: string | null
  venue: string | null
  resultType: string | null
  winnerTeamId: number | null
  resultText: string | null
  manualResultWinnerTeamId: number | null
  awaitingResolution: boolean
}

export interface StandingsRow {
  teamId: number
  teamName: string
  teamShort: string
  position: number
  played: number
  won: number
  lost: number
  tied: number
  noResult: number
  points: number
  nrr: number | null
}

// LEAGUE -> { overall }, GROUPS_KNOCKOUT -> { groupA, groupB }, KNOCKOUT -> null
export type TournamentStandings =
  | { overall: StandingsRow[] }
  | { groupA: StandingsRow[]; groupB: StandingsRow[] }
  | null

export interface TournamentTopRunScorer {
  player: { name: string; publicPlayerId: string }
  runs: number
  average: number | null
  strikeRate: number | null
  highestScore: { runs: number; notOut: boolean } | null
}

export interface TournamentTopWicketTaker {
  player: { name: string; publicPlayerId: string }
  wickets: number
  average: number | null
  economy: number | null
  bestBowling: { wickets: number; runs: number } | null
}

export interface TournamentStatistics {
  topRunScorers: TournamentTopRunScorer[]
  topWicketTakers: TournamentTopWicketTaker[]
}

// GET /tournaments/:publicTournamentId/analytics (tournamentAnalytics.service.js)
// — a superset of /statistics: the scoring aggregates below PLUS the same
// topRunScorers / topWicketTakers arrays (that service internally reuses
// getTournamentStatistics). All values are computed server-side.
export interface TournamentAnalytics {
  tournament: { publicTournamentId: string; name: string; format: TournamentFormat; status: TournamentStatus }
  totalFixtures: number
  finalizedMatches: number
  totalRuns: number
  totalWickets: number
  averageFirstInningsScore: number | null
  highestTeamTotal: number | null
  lowestTeamTotal: number | null
  topRunScorers: TournamentTopRunScorer[]
  topWicketTakers: TournamentTopWicketTaker[]
}

export async function fetchTournaments(
  params: { category?: TournamentCategory; limit?: number; offset?: number } = {}
): Promise<TournamentListResponse> {
  const { data } = await api.get<TournamentListResponse>('/tournaments', { params })
  return data
}

export async function fetchTournament(publicTournamentId: string): Promise<TournamentSummary> {
  const { data } = await api.get<{ tournament: TournamentSummary }>(`/tournaments/${publicTournamentId}`)
  return data.tournament
}

export async function fetchTournamentTeams(publicTournamentId: string): Promise<TournamentTeam[]> {
  const { data } = await api.get<{ teams: TournamentTeam[] }>(`/tournaments/${publicTournamentId}/teams`)
  return data.teams
}

export async function fetchTournamentSquad(publicTournamentId: string): Promise<TournamentSquadPlayer[]> {
  const { data } = await api.get<{ squad: TournamentSquadPlayer[] }>(`/tournaments/${publicTournamentId}/squad`)
  return data.squad
}

export async function fetchTournamentFixtures(publicTournamentId: string): Promise<TournamentFixture[]> {
  const { data } = await api.get<{ fixtures: TournamentFixture[] }>(`/tournaments/${publicTournamentId}/fixtures`)
  return data.fixtures
}

export async function fetchTournamentStandings(publicTournamentId: string): Promise<TournamentStandings> {
  const { data } = await api.get<{ standings: TournamentStandings }>(`/tournaments/${publicTournamentId}/standings`)
  return data.standings
}

export async function fetchTournamentStatistics(publicTournamentId: string): Promise<TournamentStatistics> {
  const { data } = await api.get<TournamentStatistics>(`/tournaments/${publicTournamentId}/statistics`)
  return data
}

export async function fetchTournamentAnalytics(publicTournamentId: string): Promise<TournamentAnalytics> {
  const { data } = await api.get<TournamentAnalytics>(`/tournaments/${publicTournamentId}/analytics`)
  return data
}
