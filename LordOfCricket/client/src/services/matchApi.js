// Client for the real-match lifecycle API (create/roster/toss/start).
// Live scoring itself still goes through scoringApi.js — this file is only
// match setup, kept separate from that file's scope.
import api from './api.js'

export async function listMatches() {
  const { data } = await api.get('/matches')
  return data
}

export async function createMatch(payload) {
  const { data } = await api.post('/matches', payload)
  return data.match
}

export async function fetchMatch(matchId) {
  const { data } = await api.get(`/matches/${matchId}`)
  return data.match
}

export async function setToss(matchId, payload) {
  const { data } = await api.patch(`/matches/${matchId}/toss`, payload)
  return data.match
}

// U9 — confirmUnderstaffed lets the caller re-send after the user
// explicitly confirms starting with unfilled umpire slots (the backend
// returns 409 + { details: { understaffed, filledSlots, totalSlots } } on
// the first, unconfirmed attempt for a genuinely understaffed match).
export async function startMatch(matchId, { confirmUnderstaffed = false } = {}) {
  const { data } = await api.post(`/matches/${matchId}/start`, { confirmUnderstaffed })
  return data.match
}

export async function finalizeMatch(matchId) {
  const { data } = await api.post(`/matches/${matchId}/finalize`)
  return data.match
}

export async function fetchMatchInnings(matchId) {
  const { data } = await api.get(`/matches/${matchId}/innings`)
  return data.innings
}

// Umpire operational actions on a match, all gated server-side by
// the same requireMatchScorerByParam gate as toss/start (only the actively
// assigned umpire may call these).
export async function checkInForMatch(matchId, { latitude, longitude } = {}) {
  const { data } = await api.post(`/matches/${matchId}/checkin`, { latitude, longitude })
  return data.slot
}

export async function fetchMatchChecklist(matchId) {
  const { data } = await api.get(`/matches/${matchId}/checklist`)
  return data.items
}

export async function updateMatchChecklistItem(matchId, itemKey, isChecked) {
  const { data } = await api.patch(`/matches/${matchId}/checklist`, { itemKey, isChecked })
  return data.item
}

export async function reportMatchIncident(matchId, { incidentType, description, occurredAt } = {}) {
  const { data } = await api.post(`/matches/${matchId}/incidents`, { incidentType, description, occurredAt })
  return data.incident
}

export async function fetchMatchIncidents(matchId) {
  const { data } = await api.get(`/matches/${matchId}/incidents`)
  return data.incidents
}
