import { useEffect, useState } from 'react'
import { fetchAllAmenities, createAmenity, updateAmenity, deleteAmenity } from '../services/adminAmenityCatalog.js'

const EMPTY_FORM = { name: '', icon: '', displayOrder: 0 }

// Amenities Master (Super Admin CMS) — the master catalog Ground Owners
// pick from (AmenityPicker.jsx) and public ground pages render
// (AmenityCatalogGrid.jsx). This page is the first admin UI amenity_catalog
// has ever had — it was seed-data-only before.
export function useAdminAmenityCatalog() {
  const [amenities, setAmenities] = useState([])
  const [iconAllowList, setIconAllowList] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [editingKey, setEditingKey] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => {
    fetchAllAmenities()
      .then(({ amenities, iconAllowList }) => {
        setAmenities(amenities)
        setIconAllowList(iconAllowList)
      })
      .catch(() => setListError('Unable to load amenities.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name || !form.icon) return
    setSubmitting(true)
    setError('')
    try {
      await createAmenity({ name: form.name, icon: form.icon, displayOrder: Number(form.displayOrder) || 0 })
      setForm(EMPTY_FORM)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to create this amenity.')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (amenity) => {
    setEditingKey(amenity.key)
    setEditError('')
    setEditForm({ name: amenity.name, icon: amenity.icon, displayOrder: amenity.display_order })
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditForm(EMPTY_FORM)
    setEditError('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingKey) return
    setEditSubmitting(true)
    setEditError('')
    try {
      await updateAmenity(editingKey, {
        name: editForm.name,
        icon: editForm.icon,
        displayOrder: Number(editForm.displayOrder) || 0,
      })
      cancelEdit()
      load()
    } catch (err) {
      setEditError(err.response?.data?.error || 'Unable to update this amenity.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const toggleActive = async (amenity) => {
    try {
      await updateAmenity(amenity.key, { isActive: !amenity.is_active })
      load()
    } catch {
      setListError('Unable to update amenity visibility.')
    }
  }

  const handleDelete = async (amenity) => {
    if (!window.confirm(`Permanently delete "${amenity.name}"? This cannot be undone — consider Deactivate instead if a ground might already be using it.`)) return
    setListError('')
    try {
      await deleteAmenity(amenity.key)
      setAmenities((prev) => prev.filter((a) => a.key !== amenity.key))
    } catch (err) {
      // 409 — still in use by a ground (see adminAmenityCatalog.controller.js).
      setListError(err.response?.data?.error || 'Unable to delete this amenity.')
    }
  }

  return {
    amenities,
    iconAllowList,
    loading,
    listError,
    form,
    setForm,
    submitting,
    error,
    handleCreate,
    editingKey,
    editForm,
    setEditForm,
    editSubmitting,
    editError,
    startEdit,
    cancelEdit,
    saveEdit,
    toggleActive,
    handleDelete,
  }
}
