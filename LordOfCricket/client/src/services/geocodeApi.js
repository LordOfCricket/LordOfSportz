import api from './api.js'

// Grounds page — "give a landmark, sort grounds around it." Resolves a
// free-text place name to real coordinates via the backend's Nominatim-
// backed GET /api/geocode (see server/src/services/geocoding.service.js).
export async function geocodeLandmark(query) {
  const { data } = await api.get('/geocode', { params: { q: query } })
  return data
}
