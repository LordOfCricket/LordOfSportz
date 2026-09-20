import { useEffect, useState } from 'react'
import { getAmenities, uploadAmenity, deleteAmenity, nextSortOrder } from '../models/adminAmenities.model.js'

export function useAdminAmenities() {
  const [amenities, setAmenities] = useState([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    getAmenities()
      .then(setAmenities)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !name) return
    setSubmitting(true)
    setError('')
    try {
      await uploadAmenity({ file, name, sortOrder: nextSortOrder(amenities) })
      setFile(null)
      setName('')
      e.target.reset()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    await deleteAmenity(id)
    setAmenities((prev) => prev.filter((a) => a.id !== id))
  }

  return {
    amenities,
    loading,
    file,
    setFile,
    name,
    setName,
    submitting,
    error,
    handleUpload,
    handleDelete,
  }
}
