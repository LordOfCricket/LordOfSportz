// Spectator live-state client. Every number comes straight
// from the server's read model on every poll; nothing is computed here.
import api from './api.js'

export async function fetchLiveMatchState(matchId) {
  const { data } = await api.get(`/matches/${matchId}/live-state`)
  return data
}
