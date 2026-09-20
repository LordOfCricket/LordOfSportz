import api from './api.js'

// Amenities Master (Super Admin CMS) — GET /admin/amenity-catalog/*.
// Distinct from groundRegistrationApi.js#fetchAmenityCatalog (public/
// ground-owner read of ACTIVE entries only) — these see + manage everything.
export async function fetchAllAmenities() {
  const { data } = await api.get('/admin/amenity-catalog')
  return data
}

export async function createAmenity({ name, icon, displayOrder }) {
  const { data } = await api.post('/admin/amenity-catalog', { name, icon, displayOrder })
  return data
}

export async function updateAmenity(key, fields) {
  const { data } = await api.patch(`/admin/amenity-catalog/${key}`, fields)
  return data
}

export async function deleteAmenity(key) {
  const { data } = await api.delete(`/admin/amenity-catalog/${key}`)
  return data
}
