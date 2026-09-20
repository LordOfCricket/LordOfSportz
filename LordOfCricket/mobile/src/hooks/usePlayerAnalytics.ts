import { useQuery } from '@tanstack/react-query'
import { fetchPlayerAnalytics, PlayerAnalytics } from '../services/analyticsApi'
import { statsKeys } from './statsKeys'

/**
 * GET /players/:publicPlayerId/analytics — deterministic advanced analytics
 * (trends, boundary %, dot-ball %, consistency, dismissal breakdown) for a
 * public player. Independent of the profile / career-stats queries so the
 * analytics section loads without blocking the rest of the profile.
 * Cached 5 minutes, matching the other public-player queries.
 */
export function usePlayerAnalytics(publicPlayerId: string | null, recent = 5, enabled = true) {
  return useQuery<PlayerAnalytics>({
    queryKey: publicPlayerId ? statsKeys.playerAnalytics(publicPlayerId, recent) : [],
    queryFn: () => {
      if (!publicPlayerId) throw new Error('Player ID required')
      return fetchPlayerAnalytics(publicPlayerId, { recent })
    },
    staleTime: 1000 * 60 * 5,
    enabled: enabled && !!publicPlayerId,
  })
}
