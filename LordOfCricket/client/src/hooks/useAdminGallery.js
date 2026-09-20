import { useEffect, useState } from 'react'
import { fetchGalleryImages, uploadGalleryImage, updateGalleryImage, deleteGalleryImage, nextOrder } from '../models/adminGallery.model.js'

export function useAdminGallery() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = () => {
    // category omitted — this page manages every category, not just ground
    fetchGalleryImages({})
      .then((data) => {
        setImages(data)
        setLoadError('')
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load gallery images.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file || !title.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await uploadGalleryImage({ file, title: title.trim(), category: 'ground', order: nextOrder(images) })
      setFile(null)
      setTitle('')
      e.target.reset()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (image) => {
    const updated = await updateGalleryImage(image.id, { isActive: !image.isActive })
    setImages((prev) => prev.map((img) => (img.id === image.id ? updated : img)))
  }

  const handleDelete = async (id) => {
    await deleteGalleryImage(id)
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  return {
    images,
    loading,
    file,
    setFile,
    title,
    setTitle,
    submitting,
    error,
    loadError,
    handleUpload,
    handleToggleActive,
    handleDelete,
  }
}
