import api from './api.js'

// Ground booking client. Every number/slot here comes
// straight from the server — the client never computes
// availability itself.
// Ground Time-Slot Pricing — publicGroundId is optional (omitted keeps the
// exact previous default-ground behavior); when passed, the server resolves
// it to a real ACTIVE ground and books/checks availability against THAT
// ground specifically — see groundBooking.controller.js#resolveOptionalGroundId.
export async function fetchAvailability(dateStr, publicGroundId = null) {
  const { data } = await api.get('/bookings/availability', { params: { date: dateStr, publicGroundId: publicGroundId || undefined } })
  return data.slots
}

export async function createBooking(payload) {
  const { data } = await api.post('/bookings', payload)
  return data.booking
}

export async function fetchMyBookings() {
  const { data } = await api.get('/bookings/my')
  return data.bookings
}

export async function cancelBooking(publicBookingId) {
  const { data } = await api.post(`/bookings/${publicBookingId}/cancel`)
  return data.booking
}

export async function fetchStaffSchedule({ from, to } = {}) {
  const { data } = await api.get('/bookings/staff/schedule', { params: { from, to } })
  return data.bookings
}

export async function createStaffBlock(payload) {
  const { data } = await api.post('/bookings/staff/block', payload)
  return data.booking
}

export async function removeStaffBlock(publicBookingId) {
  const { data } = await api.delete(`/bookings/staff/block/${publicBookingId}`)
  return data.booking
}
