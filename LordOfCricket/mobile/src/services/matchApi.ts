import api from './api'
import { MatchSummary, MatchLiveState, MatchDiscoverResponse, HomeFeedResponse } from '../types'

export async function discoverMatches(
  category: 'LIVE' | 'UPCOMING' | 'RESULTS',
  limit = 20,
  offset = 0
): Promise<MatchDiscoverResponse> {
  const response = await api.get<MatchDiscoverResponse>('/matches/discover', {
    params: { category, limit, offset },
  })
  return response.data
}

export async function getHomeFeed(): Promise<HomeFeedResponse> {
  const response = await api.get<HomeFeedResponse>('/matches/home')
  return response.data
}

export async function getMatchById(matchId: number): Promise<MatchSummary> {
  const response = await api.get<MatchSummary>(`/matches/${matchId}`)
  return response.data
}

export async function getMatchSummary(matchId: number): Promise<MatchSummary> {
  const response = await api.get<MatchSummary>(`/matches/${matchId}/summary`)
  return response.data
}

export async function getMatchLiveState(matchId: number): Promise<MatchLiveState> {
  const response = await api.get<MatchLiveState>(`/matches/${matchId}/live-state`)
  return response.data
}

export async function getMatchCommentary(matchId: number, inningsId?: number, limit = 20, before?: string) {
  const response = await api.get(`/matches/${matchId}/commentary`, {
    params: { inningsId, limit, before },
  })
  return response.data
}

export async function getMatchInnings(matchId: number) {
  const response = await api.get(`/matches/${matchId}/innings`)
  return response.data
}

export async function getUpcomingMatches(limit = 20, offset = 0) {
  return discoverMatches('UPCOMING', limit, offset)
}

export async function getLiveMatches(limit = 20, offset = 0) {
  return discoverMatches('LIVE', limit, offset)
}

export async function getCompletedMatches(limit = 20, offset = 0) {
  return discoverMatches('RESULTS', limit, offset)
}
