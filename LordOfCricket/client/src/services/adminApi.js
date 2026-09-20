import api from './api.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — the Admin Control
// Center's own API surface (server/src/routes/admin.routes.js).

export async function fetchDashboardStats() {
  const { data } = await api.get('/admin/dashboard/stats')
  return data
}

export async function fetchAllGrounds() {
  const { data } = await api.get('/admin/grounds')
  return data.grounds
}

export async function suspendGround(publicGroundId) {
  const { data } = await api.post(`/admin/grounds/${publicGroundId}/suspend`)
  return data.ground
}

export async function reactivateGround(publicGroundId) {
  const { data } = await api.post(`/admin/grounds/${publicGroundId}/reactivate`)
  return data.ground
}

export async function fetchGroundOwners() {
  const { data } = await api.get('/admin/ground-owners')
  return data.owners
}

export async function fetchGroundOwnerGrounds(userId) {
  const { data } = await api.get(`/admin/ground-owners/${userId}/grounds`)
  return data.grounds
}

export async function fetchAdminPlayers() {
  const { data } = await api.get('/admin/players')
  return data.players
}

export async function fetchAdminUmpires() {
  const { data } = await api.get('/admin/umpires')
  return data.umpires
}

// Admin-initiated password recovery / "Send Temporary Password" (§13) — the
// server generates, hashes, and emails the temporary credential directly to
// the target account's registered address; the plaintext never leaves the
// server. This just returns { success, emailSent, expiresAt, targetUser, message }.
export async function resetUserPassword(userId) {
  const { data } = await api.post(`/admin/users/${userId}/reset-password`)
  return data
}

export async function fetchAuditLog({ eventType, page = 1, limit = 50 } = {}) {
  const { data } = await api.get('/admin/audit-log', { params: { eventType, page, limit } })
  return data
}

// Reuses the existing platform-staff endpoints (server/src/routes/staff.routes.js)
// — "Admin Settings"/"Admin Management" is a client-side page over the SAME
// create-staff mechanism, not a duplicate one.
export async function fetchAllStaff() {
  const { data } = await api.get('/staff')
  return data.staff
}
