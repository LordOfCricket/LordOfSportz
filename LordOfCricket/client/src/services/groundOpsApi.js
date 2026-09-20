import api from './api.js'

// Ground operations client. Every number/segment here comes
// straight from the server's central availability engine — the client never
// computes occupancy/utilization itself.

export async function fetchGroundTimeline(dateStr) {
  const { data } = await api.get('/ground/timeline', { params: { date: dateStr } })
  return data
}

export async function fetchGroundDashboard() {
  const { data } = await api.get('/ground/dashboard')
  return data
}

export async function fetchGroundReport({ from, to }) {
  const { data } = await api.get('/ground/reports', { params: { from, to } })
  return data
}

export async function fetchGroundUtilization({ from, to }) {
  const { data } = await api.get('/ground/utilization', { params: { from, to } })
  return data
}

export async function fetchGroundAuditLog({ limit, offset } = {}) {
  const { data } = await api.get('/ground/audit-log', { params: { limit, offset } })
  return data
}

export async function fetchBookingHistory({ q, status, bookingType, from, to, limit, offset } = {}) {
  const { data } = await api.get('/bookings/history', { params: { q, status, bookingType, from, to, limit, offset } })
  return data
}

export async function fetchMyNotifications({ limit, offset } = {}) {
  const { data } = await api.get('/ground/notifications', { params: { limit, offset } })
  return data
}

export async function markNotificationRead(id) {
  const { data } = await api.post(`/ground/notifications/${id}/read`)
  return data.notification
}

export async function markAllNotificationsRead() {
  await api.post('/ground/notifications/read-all')
}
