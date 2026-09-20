import api from './api.js'

export async function getFeaturedIndiaMatch() {
  const { data } = await api.get('/india-match/featured')
  return data
}
