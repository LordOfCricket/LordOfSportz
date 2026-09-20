// U4 — the umpire's own dashboard: available matches, my assignments,
// apply/cancel, my profile. Kept separate from umpireApi.js (the
// umpire_requests admin-approval-queue concern) and matchApi.js (general
// match lifecycle) — this file is specifically "my own umpire self-service".
import api from './api.js'

export async function fetchMyAssignments() {
  const { data } = await api.get('/umpire/assignments')
  return data.assignments
}

export async function applyForUmpireSlot(matchId) {
  const { data } = await api.post(`/matches/${matchId}/umpire-slots/apply`)
  return data.slot
}

export async function cancelUmpireAssignment(matchId) {
  const { data } = await api.post(`/matches/${matchId}/umpire-slots/cancel`)
  return data.slot
}

// U3's per-match slot detail (umpire name per slot) — no frontend caller
// needed it until U5's Ground Owner match view ("show assigned umpire
// information"). Same GET /matches/:matchId/umpire-slots route, just the
// missing wrapper.
export async function fetchMatchUmpireSlots(matchId) {
  const { data } = await api.get(`/matches/${matchId}/umpire-slots`)
  return data.slots
}

// Ground-wise discovery — one large card per ground, each carrying its
// own upcoming matches + real umpire-slot status. Two entry points
// mirroring groundsApi.js's nearby/city split: nearby needs coordinates
// (from useGeolocation, click-to-request only), city is the manual
// fallback when location is denied/unavailable.
// Default "Grounds for Umpire" view — every ground with an upcoming match,
// unfiltered, so the page shows real content the instant it's opened.
export async function fetchAllGroundsForUmpire({ page, limit }) {
  const { data } = await api.get('/umpire/grounds/all', { params: { page, limit } })
  return data
}

export async function fetchNearbyGroundsForUmpire({ latitude, longitude, radiusKm, page, limit }) {
  const { data } = await api.get('/umpire/grounds/nearby', {
    params: { lat: latitude, lng: longitude, radiusKm, page, limit },
  })
  return data
}

export async function fetchGroundsByCityForUmpire({ city, page, limit }) {
  const { data } = await api.get('/umpire/grounds/by-city', { params: { city, page, limit } })
  return data
}

export async function fetchMyUmpireProfile() {
  const { data } = await api.get('/umpire/profile')
  return data.profile
}

export async function updateMyUmpireProfile(fields) {
  const { data } = await api.patch('/umpire/profile', fields)
  return data.profile
}

// Umpire Communication & Commercial 2.0 — "My Earnings" summary + recent list.
export async function fetchMyEarnings() {
  const { data } = await api.get('/umpire/earnings')
  return data
}

// Umpire Intelligence & Scale 2.0 — monthly officiating/rating/reliability trend.
export async function fetchMyOfficiatingTrend(months) {
  const { data } = await api.get('/umpire/statistics/trend', { params: { months } })
  return data.months
}

// Umpire Intelligence & Scale 2.0 — AI performance summary (self-scoped).
export async function fetchMyUmpireInsight() {
  const { data } = await api.get('/umpire/ai-insight')
  return data
}

export async function regenerateMyUmpireInsight() {
  const { data } = await api.post('/umpire/ai-insight/regenerate')
  return data
}
