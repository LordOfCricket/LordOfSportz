import api from './api.js'

export async function fetchMyAvailability(matchId) {
  const { data } = await api.get(`/me/availability/${matchId}`)
  return data
}

export async function setMyAvailability(matchId, status) {
  const { data } = await api.patch(`/me/availability/${matchId}`, { status })
  return data
}

export async function fetchMatchAvailability(matchId) {
  const { data } = await api.get(`/matches/${matchId}/availability`)
  return data.players
}
