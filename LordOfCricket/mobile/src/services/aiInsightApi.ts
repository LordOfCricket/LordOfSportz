import api from './api'

// Phase 16 AI Insight read endpoints — the SAME public endpoints and
// response contract the website already uses (client/src/services/
// aiInsightApi.js). Every response is HTTP 200 with an `available` flag;
// "no insight yet" is never an error. Grounding, structured-output
// validation, id post-processing and caching all happen server-side —
// the client only renders what it's given.

export type AIUnavailableReason =
  | 'NOT_CONFIGURED'
  | 'INSUFFICIENT_DATA'
  | 'PROVIDER_ERROR'
  | 'DECLINED'
  | 'INVALID_OUTPUT'

export interface MatchInsight {
  headline: string
  summary: string
  keyMoments: { type?: string; inningsNumber?: number; ballLabel?: string; label?: string; explanation: string }[]
  standoutPerformers: { publicPlayerId: string; reason: string }[]
}

export interface PersonInsight {
  headline: string
  summary: string
  highlights: string[]
}

export type AIInsightResult<T> =
  | { available: true; insight: T; generatedAt?: string; model?: string; stale?: boolean; cached?: boolean }
  | { available: false; reason: AIUnavailableReason }

export async function fetchMatchInsight(matchId: number | string): Promise<AIInsightResult<MatchInsight>> {
  const { data } = await api.get<AIInsightResult<MatchInsight>>(`/matches/${matchId}/ai-insight`)
  return data
}

export async function fetchPlayerInsight(publicPlayerId: string): Promise<AIInsightResult<PersonInsight>> {
  const { data } = await api.get<AIInsightResult<PersonInsight>>(`/players/${publicPlayerId}/ai-insight`)
  return data
}

export async function fetchTeamInsight(teamId: number | string): Promise<AIInsightResult<PersonInsight>> {
  const { data } = await api.get<AIInsightResult<PersonInsight>>(`/teams/${teamId}/ai-insight`)
  return data
}
