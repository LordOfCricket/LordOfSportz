import api from './api.js'

export async function getMerchandise() {
  const { data } = await api.get('/merchandise')
  return data.items
}

export async function getMerchandiseItem(id) {
  const { data } = await api.get(`/merchandise/${id}`)
  return data
}

// Admin — every product, any status. Optional { category, status, q, sort, page, pageSize }.
export async function getAllMerchandiseAdmin(params = {}) {
  const { data } = await api.get('/merchandise/admin', { params })
  return data
}

export async function getMerchandiseAdminItem(id) {
  const { data } = await api.get(`/merchandise/admin/${id}`)
  return data
}

function appendProductFields(formData, fields) {
  const {
    name,
    description,
    category,
    originalPrice,
    sellingPrice,
    discountPrice,
    stockQuantity,
    sku,
    isFeatured,
    status,
    sortOrder,
    attributes,
  } = fields
  if (name !== undefined) formData.append('name', name)
  if (description !== undefined) formData.append('description', description)
  if (category !== undefined) formData.append('category', category)
  if (originalPrice !== undefined) formData.append('originalPrice', originalPrice)
  if (sellingPrice !== undefined) formData.append('sellingPrice', sellingPrice)
  if (discountPrice !== undefined) formData.append('discountPrice', discountPrice)
  if (stockQuantity !== undefined) formData.append('stockQuantity', stockQuantity)
  if (sku !== undefined) formData.append('sku', sku)
  if (isFeatured !== undefined) formData.append('isFeatured', isFeatured ? 'true' : 'false')
  if (status !== undefined) formData.append('status', status)
  if (sortOrder !== undefined) formData.append('sortOrder', sortOrder)
  if (attributes !== undefined) formData.append('attributes', JSON.stringify(attributes || {}))
}

export async function createMerchandise({ file, ...fields }) {
  const formData = new FormData()
  formData.append('image', file)
  appendProductFields(formData, fields)
  const { data } = await api.post('/merchandise', formData)
  return data
}

export async function updateMerchandise(id, { file, ...fields } = {}) {
  const formData = new FormData()
  if (file) formData.append('image', file)
  appendProductFields(formData, fields)
  const { data } = await api.patch(`/merchandise/${id}`, formData)
  return data
}

export async function deleteMerchandise(id) {
  const { data } = await api.delete(`/merchandise/${id}`)
  return data
}
