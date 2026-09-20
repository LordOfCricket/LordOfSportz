import api from './api.js'

export async function getGroundPhotos() {
  const { data } = await api.get('/ground-photos')
  return data
}

export async function uploadGroundPhoto({ file, title, sortOrder }) {
  const formData = new FormData()
  formData.append('photo', file)
  if (title) formData.append('title', title)
  if (sortOrder) formData.append('sortOrder', sortOrder)
  const { data } = await api.post('/ground-photos/upload', formData)
  return data
}

export async function deleteGroundPhoto(id) {
  const { data } = await api.delete(`/ground-photos/${id}`)
  return data
}
