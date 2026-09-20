import api from './api.js'

// Cloudinary + MongoDB-backed gallery (server/src/routes/galleryImage.routes.js)
// — the ground-photo area's data source. Distinct from services/groundPhotos.js
// (the older Postgres-backed /ground-photos endpoint), which still powers the
// full gallery section further down the homepage; not touched by this change.
export async function fetchGalleryImages({ category } = {}) {
  const { data } = await api.get('/gallery', { params: category ? { category } : undefined })
  return data.images
}

export async function uploadGalleryImage({ file, title, description, category, order }) {
  const formData = new FormData()
  formData.append('image', file)
  formData.append('title', title)
  if (description) formData.append('description', description)
  if (category) formData.append('category', category)
  if (order !== undefined && order !== '') formData.append('order', order)
  const { data } = await api.post('/gallery', formData)
  return data.image
}

export async function updateGalleryImage(id, updates) {
  const { data } = await api.patch(`/gallery/${id}`, updates)
  return data.image
}

export async function deleteGalleryImage(id) {
  const { data } = await api.delete(`/gallery/${id}`)
  return data
}
