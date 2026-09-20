import api from './api.js'

// Public — only active/visible sponsors (SponsorsSection.jsx, the LOC homepage).
export async function getPartners() {
  const { data } = await api.get('/partners')
  return data
}

// Admin — every sponsor, active or not (Sponsors management page).
export async function getAllPartnersAdmin() {
  const { data } = await api.get('/partners/admin')
  return data
}

export async function uploadPartner({ file, name, websiteUrl, description, sortOrder }) {
  const formData = new FormData()
  formData.append('logo', file)
  formData.append('name', name)
  if (websiteUrl) formData.append('websiteUrl', websiteUrl)
  if (description) formData.append('description', description)
  if (sortOrder) formData.append('sortOrder', sortOrder)
  const { data } = await api.post('/partners/upload', formData)
  return data
}

// Edit an existing sponsor — name/description/websiteUrl/isActive/
// displayOrder, optionally replacing the logo (pass `file`).
export async function updatePartner(id, { file, name, websiteUrl, description, isActive, sortOrder } = {}) {
  const formData = new FormData()
  if (file) formData.append('logo', file)
  if (name !== undefined) formData.append('name', name)
  if (websiteUrl !== undefined) formData.append('websiteUrl', websiteUrl)
  if (description !== undefined) formData.append('description', description)
  if (isActive !== undefined) formData.append('isActive', isActive)
  if (sortOrder !== undefined) formData.append('sortOrder', sortOrder)
  const { data } = await api.patch(`/partners/${id}`, formData)
  return data
}

export async function deletePartner(id) {
  const { data } = await api.delete(`/partners/${id}`)
  return data
}
