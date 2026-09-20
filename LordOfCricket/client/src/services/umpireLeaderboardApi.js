import api from './api.js'

// Umpire Intelligence & Scale 2.0 — public, deliberately separate from
// statisticsApi.js's player leaderboard.
export async function fetchTopUmpires({ limit, offset } = {}) {
  const { data } = await api.get('/stats/top-umpires', { params: { limit, offset } })
  return data
}
