import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchLeaderboard, LeaderboardResponse } from '../services/statisticsApi'
import { statsKeys } from './statsKeys'

export interface UseLeaderboardParams {
  metric: string
  role?: string | null
  teamId?: number | null
  limit?: number
  offset?: number
}

/**
 * GET /stats/leaderboards/:metric — one page of an official leaderboard.
 * `keepPreviousData` keeps the current page visible while the next page /
 * a changed filter loads, so paging doesn't flash an empty list.
 * Cached 5 minutes (leaderboards only change when a match is finalized).
 */
export function useLeaderboard({ metric, role = null, teamId = null, limit = 15, offset = 0 }: UseLeaderboardParams) {
  return useQuery<LeaderboardResponse>({
    queryKey: statsKeys.leaderboard(metric, role, teamId, limit, offset),
    queryFn: () =>
      fetchLeaderboard(metric, {
        role: role || undefined,
        teamId: teamId ?? undefined,
        limit,
        offset,
      }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  })
}
