import api from './api.js'

export async function createStaff(payload) {
  const response = await api.post('/staff', payload)
  return response.data.user
}
