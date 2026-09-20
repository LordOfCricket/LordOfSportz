import { useEffect, useState } from 'react'
import { getAllPartnersAdmin, uploadPartner, updatePartner, deletePartner } from '../services/partners.js'

const EMPTY_EDIT_FORM = { name: '', websiteUrl: '', description: '', file: null }

// Sponsors (Super Admin CMS) — this is the admin-facing evolution of the
// former "Partners" upload-only page: reuses the same underlying `partners`
// table/API (see partner.model.js — Sponsors and Partners were never two
// separate concepts in this codebase, SponsorsSection.jsx on the public
// homepage already read from `partners`) with add/edit/deactivate/delete
// now all present. `getAllPartnersAdmin` (not the public `getPartners`) so
// inactive sponsors stay visible here to be reactivated.
export function useAdminSponsors() {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState('')

  const load = () => {
    getAllPartnersAdmin()
      .then(setPartners)
      .catch(() => setListError('Unable to load sponsors.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !name) return
    setSubmitting(true)
    setError('')
    try {
      await uploadPartner({ file, name, websiteUrl, description, sortOrder: partners.length + 1 })
      setFile(null)
      setName('')
      setWebsiteUrl('')
      setDescription('')
      e.target.reset()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (partner) => {
    setEditingId(partner.id)
    setEditError('')
    setEditForm({
      name: partner.name || '',
      websiteUrl: partner.website_url || '',
      description: partner.description || '',
      file: null,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(EMPTY_EDIT_FORM)
    setEditError('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editingId) return
    setEditSubmitting(true)
    setEditError('')
    try {
      await updatePartner(editingId, {
        name: editForm.name,
        websiteUrl: editForm.websiteUrl,
        description: editForm.description,
        file: editForm.file,
      })
      cancelEdit()
      load()
    } catch (err) {
      setEditError(err.response?.data?.message || 'Update failed')
    } finally {
      setEditSubmitting(false)
    }
  }

  const toggleActive = async (partner) => {
    try {
      await updatePartner(partner.id, { isActive: !partner.is_active })
      load()
    } catch {
      setListError('Unable to update sponsor visibility.')
    }
  }

  const handleDelete = async (partner) => {
    if (!window.confirm(`Permanently delete "${partner.name}"? This cannot be undone — consider Deactivate instead if you might want it back.`)) return
    try {
      await deletePartner(partner.id)
      setPartners((prev) => prev.filter((p) => p.id !== partner.id))
    } catch {
      setListError('Unable to delete sponsor.')
    }
  }

  return {
    partners,
    loading,
    listError,
    file,
    setFile,
    name,
    setName,
    websiteUrl,
    setWebsiteUrl,
    description,
    setDescription,
    submitting,
    error,
    handleUpload,
    editingId,
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
