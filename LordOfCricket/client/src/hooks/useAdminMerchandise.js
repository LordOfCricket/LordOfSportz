import { useCallback, useEffect, useState } from 'react'
import {
  getAllMerchandiseAdmin,
  createMerchandise,
  updateMerchandise,
  deleteMerchandise,
} from '../services/merchandise.js'

export const MERCHANDISE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']
export const STATUS_LABELS = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  OUT_OF_STOCK: 'Out of Stock',
}
export const SORT_OPTIONS = [
  { value: 'order', label: 'Display order' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'stock', label: 'Stock: low to high' },
]
const PAGE_SIZE = 10

export const emptyForm = () => ({
  name: '',
  description: '',
  originalPrice: '',
  sellingPrice: '',
  discountPrice: '',
  stockQuantity: '',
  sku: '',
  isFeatured: false,
  status: 'DRAFT',
  sortOrder: '',
  attributes: {},
  file: null,
})

function clientValidate(form) {
  if (!form.name.trim()) return 'Product name is required.'
  const selling = Number(form.sellingPrice)
  if (!Number.isFinite(selling) || selling <= 0) return 'Selling price must be greater than 0.'
  if (form.originalPrice !== '' && form.originalPrice != null) {
    const original = Number(form.originalPrice)
    if (!Number.isFinite(original) || original <= 0) return 'Original price must be greater than 0.'
    if (selling > original) return 'Selling price cannot be greater than the original price.'
  }
  if (form.discountPrice !== '' && form.discountPrice != null) {
    const discount = Number(form.discountPrice)
    if (!Number.isFinite(discount) || discount <= 0) return 'Discount price must be greater than 0.'
    if (discount > selling) return 'Discount price cannot be greater than the selling price.'
  }
  if (form.stockQuantity !== '' && form.stockQuantity != null) {
    const stock = Number(form.stockQuantity)
    if (!Number.isInteger(stock) || stock < 0) return 'Stock quantity must be a non-negative whole number.'
  }
  if (form.sortOrder !== '' && form.sortOrder != null) {
    const order = Number(form.sortOrder)
    if (!Number.isInteger(order) || order < 0) return 'Display order must be a non-negative whole number.'
  }
  return null
}

function toPayload(form, category) {
  return {
    file: form.file || undefined,
    name: form.name.trim(),
    description: form.description,
    category,
    originalPrice: form.originalPrice,
    sellingPrice: form.sellingPrice,
    discountPrice: form.discountPrice,
    stockQuantity: form.stockQuantity === '' ? 0 : form.stockQuantity,
    sku: form.sku,
    isFeatured: form.isFeatured,
    status: form.status,
    sortOrder: form.sortOrder === '' ? 0 : form.sortOrder,
    attributes: form.attributes || {},
  }
}

// Super Admin merchandise CMS, scoped to one category. Real backend:
// GET|POST|PATCH|DELETE /api/merchandise (+ /admin list with
// category/status/q/sort/page query).
export function useAdminMerchandise(category) {
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('order')
  const [page, setPage] = useState(1)

  const [addForm, setAddForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm())
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const load = useCallback(() => {
    if (!category) return
    setLoading(true)
    getAllMerchandiseAdmin({ category, status: statusFilter || undefined, q: q || undefined, sort, page, pageSize: PAGE_SIZE })
      .then((data) => {
        setProducts(data.items)
        setTotal(data.total ?? data.items.length)
        setListError('')
      })
      .catch(() => setListError('Unable to load products.'))
      .finally(() => setLoading(false))
  }, [category, statusFilter, q, sort, page])

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!addForm.file) return setError('A product image is required.')
    const invalid = clientValidate(addForm)
    if (invalid) return setError(invalid)

    setSubmitting(true)
    try {
      await createMerchandise(toPayload(addForm, category))
      setAddForm(emptyForm())
      e.target.reset()
      setNotice('Product added.')
      setPage(1)
      load()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to add product.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (product) => {
    setEditingId(product.id)
    setEditError('')
    setEditForm({
      name: product.name || '',
      description: product.description || '',
      originalPrice: product.originalPrice ?? '',
      sellingPrice: product.sellingPrice ?? '',
      discountPrice: product.discountPrice ?? '',
      stockQuantity: product.stockQuantity ?? '',
      sku: product.sku ?? '',
      isFeatured: Boolean(product.isFeatured),
      status: product.status || 'DRAFT',
      sortOrder: product.sortOrder ?? '',
      attributes: { ...(product.attributes || {}) },
      file: null,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(emptyForm())
    setEditError('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingId) return
    setEditError('')
    const invalid = clientValidate(editForm)
    if (invalid) return setEditError(invalid)

    setEditSubmitting(true)
    try {
      const payload = toPayload(editForm, category)
      payload.originalPrice = editForm.originalPrice
      payload.discountPrice = editForm.discountPrice
      await updateMerchandise(editingId, payload)
      cancelEdit()
      setNotice('Product updated.')
      load()
    } catch (err) {
      setEditError(err.response?.data?.error || err.response?.data?.message || 'Update failed.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const changeStatus = async (product, status) => {
    try {
      await updateMerchandise(product.id, { status })
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status } : p)))
      setNotice('Status updated.')
    } catch {
      setListError('Unable to update product status.')
    }
  }

  const toggleFeatured = async (product) => {
    try {
      await updateMerchandise(product.id, { isFeatured: !product.isFeatured })
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isFeatured: !p.isFeatured } : p)))
    } catch {
      setListError('Unable to update featured flag.')
    }
  }

  const handleDelete = async (product) => {
    if (!window.confirm(`Permanently delete "${product.name}"? This cannot be undone — set the status to Inactive instead if you might want it back.`)) return
    try {
      await deleteMerchandise(product.id)
      setNotice('Product deleted.')
      load()
    } catch {
      setListError('Unable to delete product.')
    }
  }

  return {
    products,
    total,
    pageSize: PAGE_SIZE,
    page,
    setPage,
    loading,
    listError,
    notice,
    q,
    setQ,
    statusFilter,
    setStatusFilter,
    sort,
    setSort,
    addForm,
    setAddForm,
    submitting,
    error,
    handleAdd,
    editingId,
    editForm,
    setEditForm,
    editSubmitting,
    editError,
    startEdit,
    cancelEdit,
    saveEdit,
    changeStatus,
    toggleFeatured,
    handleDelete,
  }
}
