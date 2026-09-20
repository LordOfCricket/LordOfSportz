import { useQuery } from '@tanstack/react-query'
import { fetchTeamComparison, TeamComparison } from '../services/analyticsApi'
import { statsKeys } from './statsKeys'

/**
 * GET /teams/compare?t1=&t2= — side-by-side record + head-to-head for two
 * teams. Only runs once both ids are present and differ (the server also
 * enforces both). Cached 5 minutes.
 */
export function useTeamComparison(t1: number | null, t2: number | null) {
  const ready = t1 != null && t2 != null && t1 !== t2
  return useQuery<TeamComparison>({
    queryKey: ready ? statsKeys.teamComparison(t1 as number, t2 as number) : [],
    queryFn: () => fetchTeamComparison(t1 as number, t2 as number),
    staleTime: 1000 * 60 * 5,
    enabled: ready,
  })
}
