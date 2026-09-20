import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  fetchTournaments,
  fetchTournament,
  fetchTournamentTeams,
  fetchTournamentSquad,
  fetchTournamentFixtures,
  fetchTournamentStandings,
  fetchTournamentAnalytics,
  TournamentCategory,
  TournamentListResponse,
  TournamentSummary,
  TournamentTeam,
  TournamentSquadPlayer,
  TournamentFixture,
  TournamentStandings,
  TournamentAnalytics,
} from '../services/tournamentApi'

const tournamentKeys = {
  all: ['tournaments'] as const,
  list: (category: TournamentCategory) => [...tournamentKeys.all, 'list', category] as const,
  detail: (publicTournamentId: string) => [...tournamentKeys.all, 'detail', publicTournamentId] as const,
}

/** GET /tournaments?category= — Live / Upcoming / Completed. */
export function useTournaments(category: TournamentCategory) {
  return useQuery<TournamentListResponse>({
    queryKey: tournamentKeys.list(category),
    queryFn: () => fetchTournaments({ category, limit: 30 }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 2,
  })
}

export interface TournamentDetail {
  tournament: TournamentSummary
  teams: TournamentTeam[]
  squad: TournamentSquadPlayer[]
  fixtures: TournamentFixture[]
  standings: TournamentStandings
  // GET /tournaments/:id/analytics — a superset of /statistics (scoring
  // aggregates + top run scorers / wicket takers), so this is the one call
  // that covers the whole Stats section. Replaced the separate /statistics
  // fetch batch 2 shipped.
  analytics: TournamentAnalytics
}

/**
 * The full tournament hub — overview/teams/squad/fixtures/standings/
 * statistics in one parallel fetch, mirroring the website's
 * useTournamentDetail. React never computes any of it.
 */
export function useTournamentDetail(publicTournamentId: string | null) {
  return useQuery<TournamentDetail>({
    queryKey: publicTournamentId ? tournamentKeys.detail(publicTournamentId) : [],
    enabled: !!publicTournamentId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const id = publicTournamentId as string
      const [tournament, teams, squad, fixtures, standings, analytics] = await Promise.all([
        fetchTournament(id),
        fetchTournamentTeams(id),
        fetchTournamentSquad(id),
        fetchTournamentFixtures(id),
        fetchTournamentStandings(id),
        fetchTournamentAnalytics(id),
      ])
      return { tournament, teams, squad, fixtures, standings, analytics }
    },
  })
}
