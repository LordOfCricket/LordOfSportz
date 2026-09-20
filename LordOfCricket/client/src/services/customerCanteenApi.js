import api from './api.js'

// Customer canteen ordering migration — replaces the legacy platform-wide
// canteenApi.js (baseURL '/canteen', resolves "the" canteen via the
// transitional attachCurrentCanteen -> findSingleCanteen(), which breaks
// with a 409 the instant more than one canteen exists) with the real,
// already-tested ground/canteen-scoped routes
// (/grounds/:publicGroundId/canteens/:publicCanteenId/...). Same controller
// functions on the backend either way (buildCanteenMenuRouter/
// buildCanteenOrderRouter share them across both routers), so response
// shapes are identical — only the URL construction changes here.
//
// Deliberately a NEW file, not a rewrite of canteenApi.js: the canteen
// staff dashboard (client/src/models/canteenDashboard.model.js) still
// depends on canteenApi.js's existing exports and is explicitly out of
// scope for this migration (see CUSTOMER_CANTEEN_MIGRATION_INSPECTION.md
// §4) — leaving that file untouched guarantees zero risk to it.
//
// Uses the shared, credentialed `api` instance (services/api.js) instead of
// canteenApi.js's separate axios instance — the same client every other
// ground-scoped feature already uses, which also means this flow now
// benefits from the existing global 401 -> session-expiry redirect it
// never had before.

function base(publicGroundId, publicCanteenId) {
  return `/grounds/${publicGroundId}/canteens/${publicCanteenId}`
}

export async function fetchCanteenMenu(publicGroundId, publicCanteenId) {
  const { data } = await api.get(`${base(publicGroundId, publicCanteenId)}/menu`)
  return data.items
}

export async function fetchMyActiveOrder(publicGroundId, publicCanteenId, userId) {
  const { data } = await api.get(`${base(publicGroundId, publicCanteenId)}/orders/active/${userId}`)
  return data.order
}

export async function fetchMyOrderHistory(publicGroundId, publicCanteenId, userId) {
  const { data } = await api.get(`${base(publicGroundId, publicCanteenId)}/orders/history/${userId}`)
  return data.orders
}

export async function placeCanteenOrder(publicGroundId, publicCanteenId, payload) {
  const { data } = await api.post(`${base(publicGroundId, publicCanteenId)}/orders`, payload)
  return data.order
}

export async function fetchCanteenOrder(publicGroundId, publicCanteenId, orderId) {
  const { data } = await api.get(`${base(publicGroundId, publicCanteenId)}/orders/${orderId}`)
  return data.order
}
