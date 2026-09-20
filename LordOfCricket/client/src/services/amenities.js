import api from './api.js'

export async function getAmenities() {
  const { data } = await api.get('/amenities')
  return data
}

export async function uploadAmenity({ file, name, sortOrder }) {
  const formData = new FormData()
  formData.append('photo', file)
  formData.append('name', name)
  if (sortOrder) formData.append('sortOrder', sortOrder)
  const { data } = await api.post('/amenities/upload', formData)
  return data
}

export async function deleteAmenity(id) {
  const { data } = await api.delete(`/amenities/${id}`)
  return data
}
