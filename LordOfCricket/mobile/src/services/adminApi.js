import api from './api'

// Platform administration client. Every call is authorized server-side as
// SUPER_ADMIN — client-side detection is defense-in-depth only. Uses the
// shared session-cookie Axios client; no new instance, no cookie handling.

export async function fetchDashboardStats() {
  const { data } = await api.get('/admin/dashboard/stats')
  return data
}

export async function fetchGrounds() {
  const { data } = await api.get('/admin/grounds')
  return Array.isArray(data?.grounds) ? data.grounds : []
}

export async function suspendGround(publicGroundId) {
  const { data } = await api.post(`/admin/grounds/${publicGroundId}/suspend`)
  return data?.ground ?? null
}

export async function reactivateGround(publicGroundId) {
  const { data } = await api.post(`/admin/grounds/${publicGroundId}/reactivate`)
  return data?.ground ?? null
}

// Ground registration requests. Approve is intentionally web-only and is
// not wired here.
export async function fetchGroundRequests() {
  const { data } = await api.get('/ground-owner-requests')
  return Array.isArray(data?.requests) ? data.requests : []
}

export async function fetchGroundRequest(publicRequestId) {
  const { data } = await api.get(`/ground-owner-requests/${publicRequestId}`)
  return data?.request ?? null
}

export async function rejectGroundRequest(publicRequestId, reason) {
  const { data } = await api.post(`/ground-owner-requests/${publicRequestId}/reject`, { reason })
  return data?.request ?? null
}

export async function requestGroundInformation(publicRequestId, notes) {
  const { data } = await api.post(`/ground-owner-requests/${publicRequestId}/request-information`, { notes })
  return data?.request ?? null
}

// Umpire requests. List returns a raw array of pending requests; the
// decision body is { status: 'approved' | 'rejected' }.
export async function fetchUmpireRequests() {
  const { data } = await api.get('/umpire-requests')
  return Array.isArray(data) ? data : []
}

export async function decideUmpireRequest(id, status) {
  const { data } = await api.patch(`/umpire-requests/${id}`, { status })
  return data?.request ?? null
}

// Read-only platform directories.
export async function fetchOwners() {
  const { data } = await api.get('/admin/ground-owners')
  return Array.isArray(data?.owners) ? data.owners : []
}

export async function fetchOwnerGrounds(userId) {
  const { data } = await api.get(`/admin/ground-owners/${userId}/grounds`)
  return Array.isArray(data?.grounds) ? data.grounds : []
}

export async function fetchPlayers() {
  const { data } = await api.get('/admin/players')
  return Array.isArray(data?.players) ? data.players : []
}

export async function fetchUmpires() {
  const { data } = await api.get('/admin/umpires')
  return Array.isArray(data?.umpires) ? data.umpires : []
}

export async function fetchStaff() {
  const { data } = await api.get('/staff')
  return Array.isArray(data?.staff) ? data.staff : []
}

// Paginated, read-only. Server accepts page and eventType (limit is left to
// the backend default, matching the web client). Response:
// { events: [...], pagination: { page, limit, total, totalPages } }.
// --- Content management ---

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

// Appends only defined values; booleans/numbers become strings, which every
// content controller normalizes server-side.
function buildForm(fields, filePart) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, typeof v === 'string' ? v : String(v))
  })
  if (filePart) form.append(filePart.field, { uri: filePart.uri, name: filePart.name, type: filePart.type })
  return form
}

// Sponsors / partners. Create requires a logo file; edit may optionally
// replace it.
export async function fetchSponsors() {
  const { data } = await api.get('/partners/admin')
  return Array.isArray(data) ? data : []
}

export async function createSponsor(fields, logo) {
  const form = buildForm(fields, { field: 'logo', ...logo })
  const { data } = await api.post('/partners/upload', form, MULTIPART)
  return data ?? null
}

export async function updateSponsor(id, fields, logo) {
  if (logo) {
    const form = buildForm(fields, { field: 'logo', ...logo })
    const { data } = await api.patch(`/partners/${id}`, form, MULTIPART)
    return data ?? null
  }
  const { data } = await api.patch(`/partners/${id}`, fields)
  return data ?? null
}

export async function deleteSponsor(id) {
  const { data } = await api.delete(`/partners/${id}`)
  return data ?? null
}

// Merchandise. Server-side paginated / searchable list; create needs an
// image, edit is partial and keeps the existing image unless replaced.
export async function fetchMerchandise({ page = 1, pageSize = 20, q, category, status, sort } = {}) {
  const params = { page, pageSize }
  if (q) params.q = q
  if (category) params.category = category
  if (status) params.status = status
  if (sort) params.sort = sort
  const { data } = await api.get('/merchandise/admin', { params })
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
    page: Number(data?.page) || page,
    pageSize: Number(data?.pageSize) || pageSize,
  }
}

export async function fetchMerchandiseItem(id) {
  const { data } = await api.get(`/merchandise/admin/${id}`)
  return data ?? null
}

export async function createMerchandise(fields, image) {
  const form = buildForm(fields, { field: 'image', ...image })
  const { data } = await api.post('/merchandise', form, MULTIPART)
  return data ?? null
}

export async function updateMerchandise(id, fields, image) {
  const form = buildForm(fields, image ? { field: 'image', ...image } : null)
  const { data } = await api.patch(`/merchandise/${id}`, form, MULTIPART)
  return data ?? null
}

export async function deleteMerchandise(id) {
  const { data } = await api.delete(`/merchandise/${id}`)
  return data ?? null
}

// Advertisements. Create takes a hosted image URL (no upload endpoint), so
// only list + delete are exposed on mobile.
export async function fetchAdvertisements() {
  const { data } = await api.get('/advertisements')
  return Array.isArray(data) ? data : []
}

export async function deleteAdvertisement(id) {
  const { data } = await api.delete(`/advertisements/${id}`)
  return data ?? null
}

// Platform amenity master catalog. Text + icon-name only, no image upload.
export async function fetchAmenityCatalog() {
  const { data } = await api.get('/admin/amenity-catalog')
  return {
    amenities: Array.isArray(data?.amenities) ? data.amenities : [],
    iconAllowList: Array.isArray(data?.iconAllowList) ? data.iconAllowList : [],
  }
}

export async function createAmenity({ name, icon, displayOrder }) {
  const { data } = await api.post('/admin/amenity-catalog', { name, icon, displayOrder })
  return data ?? null
}

export async function updateAmenity(key, fields) {
  const { data } = await api.patch(`/admin/amenity-catalog/${key}`, fields)
  return data ?? null
}

export async function deleteAmenity(key) {
  const { data } = await api.delete(`/admin/amenity-catalog/${key}`)
  return data ?? null
}

export async function fetchAuditLog({ page = 1, eventType } = {}) {
  const params = { page }
  if (eventType) params.eventType = eventType
  const { data } = await api.get('/admin/audit-log', { params })
  return {
    events: Array.isArray(data?.events) ? data.events : [],
    pagination: data?.pagination ?? { page, limit: 0, total: 0, totalPages: 1 },
  }
}
