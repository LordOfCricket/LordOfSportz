// Match summary/scorecard client. Every number here comes straight
// from the server's read model on every request; nothing is cached client-side.
import api from './api.js'

export async function fetchMatchSummary(matchId) {
  const { data } = await api.get(`/matches/${matchId}/summary`)
  return data
}
