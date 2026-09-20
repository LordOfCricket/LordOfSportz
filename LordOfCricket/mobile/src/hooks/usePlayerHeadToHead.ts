import { useQuery } from '@tanstack/react-query'
import { fetchPlayerHeadToHead, PlayerHeadToHead } from '../services/analyticsApi'
import { statsKeys } from './statsKeys'

/**
 * GET /players/head-to-head?p1=&p2= — real batter-vs-bowler encounters in
 * the finalized matches where both players appeared. Only runs once both ids
 * are present and differ (the server also enforces this). Cached 5 minutes.
 */
export function usePlayerHeadToHead(p1: string | null, p2: string | null) {
  const ready = !!p1 && !!p2 && p1 !== p2
  return useQuery<PlayerHeadToHead>({
    queryKey: ready ? statsKeys.playerHeadToHead(p1 as string, p2 as string) : [],
    queryFn: () => fetchPlayerHeadToHead(p1 as string, p2 as string),
    staleTime: 1000 * 60 * 5,
    enabled: ready,
  })
}
