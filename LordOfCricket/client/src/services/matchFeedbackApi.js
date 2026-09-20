import api from './api.js'

export async function fetchFeedbackContext(matchId) {
  const { data } = await api.get(`/matches/${matchId}/feedback`)
  return data
}

export async function submitMatchFeedback(matchId, payload) {
  const { data } = await api.post(`/matches/${matchId}/feedback`, payload)
  return data.feedback
}
