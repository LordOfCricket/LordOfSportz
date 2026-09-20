// Thin wrappers for the Advanced Cricket Analytics read endpoints.
// Every analytics endpoint is a public GET (same posture as Match Summary/
// Player/Team profiles) and always returns 200 with real data (match
// analytics uses an `available` flag for the "no innings yet" case, same
// convention the AI Insight endpoints established).
import api from './api.js'

export async function fetchPlayerAnalytics(publicPlayerId, { recent, tournamentId } = {}) {
  const { data } = await api.get(`/players/${publicPlayerId}/analytics`, { params: { recent, tournamentId } })
  return data
}

export async function fetchTeamAnalytics(teamId, { recent } = {}) {
  const { data } = await api.get(`/teams/${teamId}/analytics`, { params: { recent } })
  return data
}

export async function fetchMatchAnalytics(matchId) {
  const { data } = await api.get(`/matches/${matchId}/analytics`)
  return data
}

export async function fetchTournamentAnalytics(publicTournamentId) {
  const { data } = await api.get(`/tournaments/${publicTournamentId}/analytics`)
  return data
}

export async function fetchPlayerComparison(p1, p2) {
  const { data } = await api.get('/players/compare', { params: { p1, p2 } })
  return data
}

// Real batter-vs-bowler ENCOUNTERS in the finalized matches where both
// players appeared — distinct from fetchPlayerComparison (career totals).
export async function fetchPlayerHeadToHead(p1, p2) {
  const { data } = await api.get('/players/head-to-head', { params: { p1, p2 } })
  return data
}

export async function fetchTeamComparison(t1, t2) {
  const { data } = await api.get('/teams/compare', { params: { t1, t2 } })
  return data
}
