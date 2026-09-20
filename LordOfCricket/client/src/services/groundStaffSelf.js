import api from './api.js'

export async function fetchMyGroundStaffMemberships() {
  const { data } = await api.get('/me/ground-staff-memberships')
  return data.memberships
}
