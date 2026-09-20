// U5 — Ground Owner's own grounds/matches. Mirrors umpireSelfApi.js's shape
// (thin wrappers, real backend as the source of truth).
import api from './api.js'

export async function fetchMyGrounds() {
  const { data } = await api.get('/ground-owner/grounds')
  return data.grounds
}

// Phase 1 — Ground Profile updates. Only whitelisted fields are accepted
// (name, description, phone, email, website). Authorization is enforced
// server-side via requireGroundRole('GROUND_OWNER').
export async function updateGroundProfile(publicGroundId, updates) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}`, updates)
  return data.ground
}

export async function fetchGroundMatches(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches`)
  return data.matches
}

export async function createGroundMatch(publicGroundId, payload) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches`, payload)
  return data.match
}

// Ground-owner-scoped umpire staffing detail — same shape as the generic
// GET /matches/:matchId/umpire-slots, but properly authorized to the
// owner of the match's own ground (requireGroundRole server-side).
// Umpire Communication & Commercial 2.0 — the response now also carries
// umpireFee (match-level) and each slot's earning/payment status.
export async function fetchGroundMatchUmpireSlots(publicGroundId, matchId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots`)
  return { slots: data.slots, umpireFee: data.umpireFee }
}

export async function setGroundMatchUmpireFee(publicGroundId, matchId, { amount, currency = 'INR' }) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-fee`, { amount, currency })
  return data.match
}

export async function updateGroundMatchSlotPaymentStatus(publicGroundId, matchId, slotId, status) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/payment-status`, { status })
  return data.earning
}

// Umpire Intelligence & Scale 2.0 — deterministic, explainable candidate recommendations.
export async function fetchRecommendedUmpires(publicGroundId, matchId, { limit } = {}) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/recommended-umpires`, { params: { limit } })
  return data.candidates
}

export async function fetchUmpireOperationsSummary(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/umpire-operations-summary`)
  return data.summary
}

export async function startGroundMatch(publicGroundId, matchId, { confirmUnderstaffed = false } = {}) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/start`, { confirmUnderstaffed })
  return data.match
}

export async function completeGroundMatch(publicGroundId, matchId) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/complete`)
  return data.match
}

export async function cancelGroundMatch(publicGroundId, matchId, reason) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/cancel`, { reason })
  return data.match
}

export async function markUmpireNoShow(publicGroundId, matchId, slotId) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/no-show`)
  return data.slot
}

export async function fetchEligibleReplacements(publicGroundId, matchId, slotId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/eligible-replacements`)
  return data.candidates
}

export async function assignReplacementUmpire(publicGroundId, matchId, slotId, newUmpireUserId) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-slots/${slotId}/replace`, { newUmpireUserId })
  return data.slot
}

export async function fetchMatchAssignmentHistory(publicGroundId, matchId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/matches/${matchId}/umpire-history`)
  return data.events
}

// Phase 4 — ground-scoped Staff (GROUND_ADMIN/CANTEEN_STAFF), distinct from
// the platform-wide admin-staff endpoints (adminStaffApi.js). Server-side
// authorization is the same requireGroundRole('GROUND_OWNER') every other
// function on this file already relies on.
export async function fetchGroundStaff(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/staff`)
  return data.staff
}

export async function createGroundStaff(publicGroundId, { name, identifier, role }) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/staff`, { name, identifier, role })
  return data
}

// Phase 5 — granular Staff permissions. The catalog is ground-agnostic (the
// same 4 permissions exist for every ground); grant/revoke/disable are
// Owner-only server-side, same as createGroundStaff above.
export async function fetchPermissionCatalog() {
  const { data } = await api.get('/ground-owner/permissions/catalog')
  return data.permissions
}

export async function grantStaffPermission(publicGroundId, membershipId, permissionKey) {
  await api.post(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/permissions`, { permissionKey })
}

export async function revokeStaffPermission(publicGroundId, membershipId, permissionKey) {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/permissions/${permissionKey}`)
}

export async function disableGroundStaff(publicGroundId, membershipId) {
  await api.patch(`/ground-owner/grounds/${publicGroundId}/staff/${membershipId}/disable`)
}

// Phase 2 — Ground Owner media management (photos, gallery, hero image)
export async function fetchGroundPhotos(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/media`)
  return data.photos
}

export async function uploadGroundPhoto(publicGroundId, file, { title = null, sortOrder = 0 } = {}) {
  const formData = new FormData()
  formData.append('photo', file)
  if (title) formData.append('title', title)
  formData.append('sortOrder', sortOrder)

  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/media/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.photo
}

export async function deleteGroundPhoto(publicGroundId, photoId) {
  const { data } = await api.delete(`/ground-owner/grounds/${publicGroundId}/media/${photoId}`)
  return data.photo
}

export async function setHeroPhoto(publicGroundId, photoId) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/media/${photoId}/hero`)
  return data.photo
}

export async function reorderGroundPhotos(publicGroundId, updates) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/media/reorder`, { updates })
  return data.photos
}

// Phase 3 — Ground Owner amenity management (select from catalog, remove)
export async function fetchGroundAmenities(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/amenities`)
  return data.amenities
}

export async function addGroundAmenity(publicGroundId, amenityKey) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/amenities`, { amenityKey })
  return data.amenities
}

export async function removeGroundAmenity(publicGroundId, amenityKey) {
  const { data } = await api.delete(`/ground-owner/grounds/${publicGroundId}/amenities/${amenityKey}`)
  return data.amenities
}

// Phase 6 — Ground Owner booking & availability management.
// All endpoints are ground-scoped, authorized via requireGroundPermission('BOOKING_MANAGE').
// Reuses existing groundBooking.service logic with ground context added.
export async function fetchGroundAvailability(publicGroundId, dateStr) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/bookings/availability`, { params: { date: dateStr } })
  return data.slots
}

export async function fetchGroundBookings(publicGroundId, { fromDate, toDate, status } = {}) {
  const params = {}
  if (fromDate) params.fromDate = fromDate
  if (toDate) params.toDate = toDate
  if (status) params.status = status
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/bookings`, { params })
  return data.bookings
}

export async function fetchGroundBooking(publicGroundId, publicBookingId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/bookings/${publicBookingId}`)
  return data.booking
}

export async function updateGroundBookingStatus(publicGroundId, publicBookingId, status) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/bookings/${publicBookingId}/status`, { status })
  return data.booking
}

export async function createGroundStaffBlock(publicGroundId, { date, hour, minute = 0, purpose, blockType }) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/bookings/staff-blocks`, { date, hour, minute, purpose, blockType })
  return data.booking
}

export async function removeGroundStaffBlock(publicGroundId, publicBlockId) {
  const { data } = await api.delete(`/ground-owner/grounds/${publicGroundId}/bookings/staff-blocks/${publicBlockId}`)
  return data.booking
}

// Phase 5 — Ground Owner canteen / food & refreshments management.
// All endpoints are multi-ground aware, scoped by publicGroundId and publicCanteenId.
// Authorization: requireGroundCanteenRole(['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF'])
export async function fetchCanteenMenuItems(publicGroundId, publicCanteenId) {
  const { data } = await api.get(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/master`)
  return data.menuItems || []
}

export async function createCanteenMenuItem(publicGroundId, publicCanteenId, payload) {
  const formData = new FormData()
  formData.append('name', payload.name)
  formData.append('category', payload.category)
  formData.append('description', payload.description || '')
  formData.append('price', payload.price)
  formData.append('stock', payload.stock || 0)
  if (payload.image) {
    formData.append('image', payload.image)
  }

  const { data } = await api.post(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/master`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.menuItem
}

export async function updateCanteenMenuItem(publicGroundId, publicCanteenId, menuItemId, payload) {
  const formData = new FormData()
  if ('name' in payload) formData.append('name', payload.name)
  if ('category' in payload) formData.append('category', payload.category)
  if ('description' in payload) formData.append('description', payload.description || '')
  if ('price' in payload) formData.append('price', payload.price)
  if ('stock' in payload) formData.append('stock', payload.stock)
  if ('isActive' in payload) formData.append('isActive', payload.isActive)
  if (payload.image) {
    formData.append('image', payload.image)
  }

  const { data } = await api.patch(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/master/${menuItemId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.menuItem
}

export async function deleteCanteenMenuItem(publicGroundId, publicCanteenId, menuItemId) {
  const { data } = await api.delete(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/master/${menuItemId}`)
  return data.success
}

export async function fetchTodaysMenuConfig(publicGroundId, publicCanteenId) {
  const { data } = await api.get(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/today/config`)
  return data
}

export async function publishTodaysMenu(publicGroundId, publicCanteenId, payload) {
  const { data } = await api.patch(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/menu/today`, payload)
  return data
}

// Phase 24 — Ground Owner self-service canteen activate/deactivate.
export async function updateCanteenStatus(publicGroundId, publicCanteenId, isActive) {
  const { data } = await api.patch(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/status`, { isActive })
  return data.canteen
}

export async function fetchCanteenOrders(publicGroundId, publicCanteenId, { page = 1, limit = 20, status = null } = {}) {
  const params = { page, limit }
  if (status) params.status = status
  const { data } = await api.get(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/orders`, { params })
  return data
}

export async function updateCanteenOrderStatus(publicGroundId, publicCanteenId, orderId, status) {
  const { data } = await api.patch(`/grounds/${publicGroundId}/canteens/${publicCanteenId}/orders/${orderId}/status`, { status })
  return data.order
}

// Phase 9 — Ground Owner Operations Dashboard. Provides real-time visibility
// into today's and upcoming ground activities (bookings, matches, staff blocks).
export async function fetchGroundDashboard(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/dashboard`)
  return data
}

// Phase 10 — Ground Owner Analytics & Reports. `range` is one of
// 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' (server validates against the
// same allow-list; an unrecognized value falls back to 'TODAY' there too).
export async function fetchGroundAnalytics(publicGroundId, range = 'TODAY') {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/analytics`, { params: { range } })
  return data
}

// Phase 14 — CSV export. responseType: 'blob' since this is a file
// download, not JSON; the actual browser save is triggered by the caller
// (GroundAnalyticsPage) via a temporary object URL.
export async function exportGroundAnalyticsCsv(publicGroundId, range = 'TODAY') {
  const response = await api.get(`/ground-owner/grounds/${publicGroundId}/analytics/export`, {
    params: { range },
    responseType: 'blob',
  })
  return response.data
}

// Phase 16 — day-by-day trend series.
export async function fetchGroundTrends(publicGroundId, range = 'TODAY') {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/analytics/trends`, { params: { range } })
  return data
}

// Phase 13 — Ground Owner Reviews. Surfaces existing match_feedback data
// (rating + comments, anonymous — see groundOwnerReviews.service.js).
export async function fetchGroundReviews(publicGroundId, { page = 1, limit = 20 } = {}) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/reviews`, { params: { page, limit } })
  return data
}

// Ground Time-Slot Pricing — owner-facing CRUD (GET requires PRICING_VIEW,
// write requires PRICING_MANAGE; server-side, never client-checked).
export async function fetchGroundPricingSlots(publicGroundId) {
  const { data } = await api.get(`/ground-owner/grounds/${publicGroundId}/pricing-slots`)
  return data.slots || []
}

export async function createGroundPricingSlot(publicGroundId, { startTime, endTime, price }) {
  const { data } = await api.post(`/ground-owner/grounds/${publicGroundId}/pricing-slots`, { startTime, endTime, price })
  return data.slot
}

export async function updateGroundPricingSlot(publicGroundId, slotId, updates) {
  const { data } = await api.patch(`/ground-owner/grounds/${publicGroundId}/pricing-slots/${slotId}`, updates)
  return data.slot
}

export async function deleteGroundPricingSlot(publicGroundId, slotId) {
  await api.delete(`/ground-owner/grounds/${publicGroundId}/pricing-slots/${slotId}`)
}
