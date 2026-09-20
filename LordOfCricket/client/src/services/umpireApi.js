import api from './api.js'

export async function fetchMyUmpireRequest() {
  const response = await api.get('/umpire-requests/me')
  return response.data.request
}

export async function fetchPendingUmpireRequests() {
  const response = await api.get('/umpire-requests')
  return response.data
}

export async function decideUmpireRequest(id, status) {
  const response = await api.patch(`/umpire-requests/${id}`, { status })
  return response.data.request
}
