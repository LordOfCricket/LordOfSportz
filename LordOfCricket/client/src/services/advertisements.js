import api from './api.js'

export async function getAdvertisements() {
  const { data } = await api.get('/advertisements')
  return data
}
