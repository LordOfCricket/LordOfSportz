import axios from 'axios'

// The merged backend serves canteen routes under /api/canteen (see server/src/app.js).
// VITE_API_URL already points at ".../api" (e.g. http://localhost:5000/api),
// same as the LOC client, so we just add the "/canteen" segment here.
//
// Phase 8 — this instance never had `withCredentials: true` and instead
// relied entirely on a localStorage JWT that no real OTP-authenticated user
// has had since Phase 3 replaced password login as the reachable login UI
// (confirmed: nothing writes to localStorage's authToken key anymore, and
// hasn't since Phase 3 shipped). Every requireAuth-gated canteen route
// (order placement, order history, staff menu management) was therefore
// sending zero authentication credential at all — a real, previously
// undiscovered production-blocking bug, not merely stale code. Fixed to
// match api.js's pattern: the HttpOnly session cookie via `withCredentials`.
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/canteen`,
  withCredentials: true,
})

export async function fetchMenu() {
  const response = await api.get('/menu')
  return response.data.items
}

export async function fetchMasterMenu() {
  const response = await api.get('/menu/master')
  return response.data.items
}

export async function createMenuItem(payload) {
  const response = await api.post('/menu/master', payload)
  return response.data.item
}

export async function updateMenuItem(id, payload) {
  const response = await api.patch(`/menu/master/${id}`, payload)
  return response.data.item
}

export async function deleteMenuItem(id) {
  const response = await api.delete(`/menu/master/${id}`)
  return response.data
}

export async function lookupOrderByUser(userId) {
  const response = await api.get('/orders/lookup', { params: { userId } })
  return response.data.order
}

export async function fetchActiveOrder(userId) {
  const response = await api.get(`/orders/active/${userId}`)
  return response.data.order
}

export async function fetchOrderHistory(userId) {
  const response = await api.get(`/orders/history/${userId}`)
  return response.data.orders
}

export async function fetchTodaysMenuConfig() {
  const response = await api.get('/menu/today/config')
  return response.data
}

export async function publishTodaysMenu(payload) {
  const response = await api.patch('/menu/today', payload)
  return response.data
}

export async function placeOrder(payload) {
  const response = await api.post('/orders', payload)
  return response.data.order
}

export async function fetchOrder(orderId) {
  const response = await api.get(`/orders/${orderId}`)
  return response.data.order
}

export async function fetchOrders(page = 1, limit = 5, status) {
  const response = await api.get('/orders', { params: { page, limit, status } })
  return response.data
}

export async function updateOrderStatus(orderId, status) {
  const response = await api.patch(`/orders/${orderId}/status`, { status })
  return response.data.order
}

export default api
