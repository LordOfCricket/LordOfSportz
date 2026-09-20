import { useQuery } from '@tanstack/react-query'
import {
  fetchMatchInsight,
  fetchPlayerInsight,
  fetchTeamInsight,
  AIInsightResult,
  MatchInsight,
  PersonInsight,
} from '../services/aiInsightApi'

// The AI section loads INDEPENDENTLY of the screen's main content — the
// caller renders the primary, deterministic screen immediately and mounts
// this in its own bounded section, never blocking on it. Cached long
// (10 min): an insight only changes when the underlying match/player/team
// data changes, which the server already fingerprints.
const AI_STALE_MS = 1000 * 60 * 10

export function useMatchInsight(matchId: number | string | null) {
  return useQuery<AIInsightResult<MatchInsight>>({
    queryKey: ['ai-insight', 'match', matchId],
    queryFn: () => fetchMatchInsight(matchId as number | string),
    enabled: matchId != null && matchId !== '',
    staleTime: AI_STALE_MS,
    retry: false,
  })
}

export function usePlayerInsight(publicPlayerId: string | null) {
  return useQuery<AIInsightResult<PersonInsight>>({
    queryKey: ['ai-insight', 'player', publicPlayerId],
    queryFn: () => fetchPlayerInsight(publicPlayerId as string),
    enabled: !!publicPlayerId,
    staleTime: AI_STALE_MS,
    retry: false,
  })
}

export function useTeamInsight(teamId: number | string | null) {
  return useQuery<AIInsightResult<PersonInsight>>({
    queryKey: ['ai-insight', 'team', teamId],
    queryFn: () => fetchTeamInsight(teamId as number | string),
    enabled: teamId != null && teamId !== '',
    staleTime: AI_STALE_MS,
    retry: false,
  })
}
