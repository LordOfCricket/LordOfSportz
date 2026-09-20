// Public match discovery client. Every number here comes
// straight from the server's read model; React never computes a score,
// target, or required run rate itself.
import api from './api.js'

export async function fetchPublicMatches({ category, limit, offset } = {}) {
  const { data } = await api.get('/matches/discover', { params: { category, limit, offset } })
  return data
}

export async function fetchHomeDiscovery() {
  const { data } = await api.get('/matches/home')
  return data
}
