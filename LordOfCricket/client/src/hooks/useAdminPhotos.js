import { useEffect, useState } from 'react'
import { getGroundPhotos, uploadGroundPhoto, deleteGroundPhoto, nextSortOrder } from '../models/adminPhotos.model.js'

export function useAdminPhotos() {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    getGroundPhotos()
      .then(setPhotos)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError('')
    try {
      await uploadGroundPhoto({ file, title, sortOrder: nextSortOrder(photos) })
      setFile(null)
      setTitle('')
      e.target.reset()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    await deleteGroundPhoto(id)
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  return {
    photos,
    loading,
    file,
    setFile,
    title,
    setTitle,
    submitting,
    error,
    handleUpload,
    handleDelete,
  }
}
