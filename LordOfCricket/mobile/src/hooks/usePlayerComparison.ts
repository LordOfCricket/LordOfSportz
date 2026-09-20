import { useQuery } from '@tanstack/react-query'
import { fetchPlayerComparison, PlayerComparison } from '../services/analyticsApi'
import { statsKeys } from './statsKeys'

/**
 * GET /players/compare?p1=&p2= — side-by-side career stats for two public
 * players. Only runs once BOTH ids are present and they differ (the server
 * also enforces both rules, returning 400; this guard just avoids a request
 * that is guaranteed to fail). Cached 5 minutes.
 */
export function usePlayerComparison(p1: string | null, p2: string | null) {
  const ready = !!p1 && !!p2 && p1 !== p2
  return useQuery<PlayerComparison>({
    queryKey: ready ? statsKeys.playerComparison(p1 as string, p2 as string) : [],
    queryFn: () => fetchPlayerComparison(p1 as string, p2 as string),
    staleTime: 1000 * 60 * 5,
    enabled: ready,
  })
}
