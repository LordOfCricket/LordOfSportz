// Thin wrapper for the three AI Insight read endpoints. Every
// response is 200 with an `available` flag (never an error for "no insight
// yet") — see docs/API.md.
import api from './api.js'

export async function fetchMatchInsight(matchId) {
  const { data } = await api.get(`/matches/${matchId}/ai-insight`)
  return data
}

export async function fetchPlayerInsight(publicPlayerId) {
  const { data } = await api.get(`/players/${publicPlayerId}/ai-insight`)
  return data
}

export async function fetchTeamInsight(teamId) {
  const { data } = await api.get(`/teams/${teamId}/ai-insight`)
  return data
}
