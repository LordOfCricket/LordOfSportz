// Umpire Communication & Commercial 2.0 — match-scoped messages. Mirrors
// umpireSelfApi.js's thin-wrapper convention.
import api from './api.js'

export async function fetchMatchMessages(matchId) {
  const { data } = await api.get(`/matches/${matchId}/messages`)
  return data.messages
}

export async function sendMatchMessage(matchId, body) {
  const { data } = await api.post(`/matches/${matchId}/messages`, { body })
  return data.message
}
