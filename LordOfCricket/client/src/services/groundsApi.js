import api from './api.js'

// Public reads (GET /api/grounds/*, Stage 1 homepage redesign) —
// thin wrappers over the shared axios instance, matching amenities.js/
// gallery.js/groundPhotos.js's existing convention. No auth header is
// required for these (the backend routes are public), but the shared `api`
// instance attaches one anyway when a session exists — harmless here since
// the endpoints don't branch on it.

// "📍 Find Grounds Near Me" — only ever called after the user grants
// geolocation permission via an explicit click (useGeolocation.js).
export async function fetchNearbyGrounds({ latitude, longitude, radiusKm, page, limit }) {
  const { data } = await api.get('/grounds/nearby', {
    params: { lat: latitude, lng: longitude, radiusKm, page, limit },
  })
  return data
}

// "SELECT YOUR CITY" — the primary discovery flow.
export async function searchGroundsByCity({ city, page, limit }) {
  const { data } = await api.get('/grounds/search', { params: { city, page, limit } })
  return data
}

// Real, distinct city names with at least one ACTIVE ground — powers
// CitySelector's searchable dropdown (never a hardcoded city list).
export async function fetchGroundCities() {
  const { data } = await api.get('/grounds/cities')
  return data.cities
}

// "Grounds already registered on LOC" — BookGroundSection/GroundsPage call
// this with whichever sort fits their own view.
export async function fetchAllGrounds({ page, limit, sort }) {
  const { data } = await api.get('/grounds', { params: { page, limit, sort } })
  return data
}

export async function fetchGroundProfile(publicGroundId) {
  const { data } = await api.get(`/grounds/${publicGroundId}`)
  return data
}
