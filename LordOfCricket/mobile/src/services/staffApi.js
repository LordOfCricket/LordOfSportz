import api from './api'

// Ground-staff self-service client. The only staff-identity endpoint:
// returns the caller's ACTIVE GROUND_ADMIN / CANTEEN_STAFF memberships,
// each with its ground and its currently-granted permission keys. A
// disabled membership or revoked permission is simply absent from the
// response (nothing is cached server-side).
export async function fetchMyStaffMemberships() {
  const { data } = await api.get('/me/ground-staff-memberships')
  return Array.isArray(data?.memberships) ? data.memberships : []
}
