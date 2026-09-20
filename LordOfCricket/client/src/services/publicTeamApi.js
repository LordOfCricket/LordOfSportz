// Public team ecosystem client. Every number here comes
// straight from the server's read model; React never computes a win/loss
// record or a top performer itself.
import api from './api.js'

export async function fetchPublicTeams({ search, limit, offset } = {}) {
  const { data } = await api.get('/teams/discover', { params: { search, limit, offset } })
  return data
}

export async function fetchTeamProfile(teamId) {
  const { data } = await api.get(`/teams/${teamId}/profile`)
  return data
}

// Staff-only team roster management.
export async function addPlayerToTeam(teamId, publicPlayerId) {
  const { data } = await api.post(`/teams/${teamId}/players`, { publicPlayerId })
  return data
}

export async function removePlayerFromTeam(teamId, publicPlayerId) {
  const { data } = await api.delete(`/teams/${teamId}/players/${publicPlayerId}`)
  return data
}
