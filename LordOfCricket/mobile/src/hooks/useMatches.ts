import { useQuery } from '@tanstack/react-query'
import * as matchApi from '../services/matchApi'

export function useHomeFeed() {
  return useQuery({
    queryKey: ['matches', 'home'],
    queryFn: () => matchApi.getHomeFeed(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useMatchesByCategory(category: 'LIVE' | 'UPCOMING' | 'RESULTS', limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['matches', category, limit, offset],
    queryFn: () => matchApi.discoverMatches(category, limit, offset),
    staleTime: 1000 * 60, // 1 minute
  })
}

export function useUpcomingMatches(limit = 20, offset = 0) {
  return useMatchesByCategory('UPCOMING', limit, offset)
}

export function useLiveMatches(limit = 20, offset = 0) {
  return useMatchesByCategory('LIVE', limit, offset)
}

export function useCompletedMatches(limit = 20, offset = 0) {
  return useMatchesByCategory('RESULTS', limit, offset)
}

export function useMatchDetail(matchId: number) {
  return useQuery({
    queryKey: ['matches', matchId],
    queryFn: () => matchApi.getMatchSummary(matchId),
    staleTime: 1000 * 60, // 1 minute
    enabled: !!matchId,
  })
}

export function useMatchLiveState(matchId: number, pollInterval = 5000) {
  return useQuery({
    queryKey: ['matches', matchId, 'live-state'],
    queryFn: () => matchApi.getMatchLiveState(matchId),
    staleTime: 0,
    refetchInterval: pollInterval,
    enabled: !!matchId,
  })
}

export function useMatchCommentary(matchId: number, inningsId?: number) {
  return useQuery({
    queryKey: ['matches', matchId, 'commentary', inningsId],
    queryFn: () => matchApi.getMatchCommentary(matchId, inningsId),
    staleTime: 1000 * 30, // 30 seconds
    enabled: !!matchId,
  })
}

export function useMatchInnings(matchId: number) {
  return useQuery({
    queryKey: ['matches', matchId, 'innings'],
    queryFn: () => matchApi.getMatchInnings(matchId),
    staleTime: 1000 * 60, // 1 minute
    enabled: !!matchId,
  })
}
