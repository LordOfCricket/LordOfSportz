import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import GroundOwnerLayout from '../../components/ground-owner/GroundOwnerLayout.jsx'
import GroundNavTabs from '../../components/ground-owner/GroundNavTabs.jsx'
import {
  fetchGroundPhotos,
  uploadGroundPhoto,
  deleteGroundPhoto,
  setHeroPhoto,
  reorderGroundPhotos,
} from '../../services/groundOwnerApi.js'

function PhotoUploadForm({ onUpload, uploading, error }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [title, setTitle] = useState('')
  const [sortOrder, setSortOrder] = useState('0')

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        alert('Only JPEG, PNG, or WEBP images are allowed.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('Image must be 10MB or smaller.')
        return
      }
      setSelectedFile(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Please select an image to upload.')
      return
    }

    const success = await onUpload(selectedFile, {
      title: title || null,
      sortOrder: parseInt(sortOrder, 10) || 0,
    })

    if (success) {
      setSelectedFile(null)
      setTitle('')
      setSortOrder('0')
      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) fileInput.value = ''
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <h3 className="mb-4 text-lg font-semibold text-white">Upload New Photo</h3>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Select Image</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-slate-400
              file:mr-4 file:rounded-xl file:border file:border-white/15
              file:bg-white/5 file:px-4 file:py-2 file:text-sm file:font-semibold
              file:text-white hover:file:bg-white/10 disabled:opacity-50"
          />
          {selectedFile && (
            <p className="mt-1 text-xs text-slate-300">{selectedFile.name}</p>
          )}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Photo Title (optional)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Main Pitch"
            disabled={uploading}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 transition disabled:opacity-50"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-200">Display Order</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={uploading}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition disabled:opacity-50"
          />
        </label>

        <button
          type="submit"
          disabled={!selectedFile || uploading}
          className="w-full rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-green-900/40"
        >
          {uploading ? 'Uploading...' : 'Upload Photo'}
        </button>
      </div>
    </form>
  )
}

function PhotoGrid({ photos, onDelete, onSetHero, onReorder, loading, deleteInProgress }) {
  const [draggedPhoto, setDraggedPhoto] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-900/50 py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    )
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 text-center">
        <p className="text-slate-400">No photos uploaded yet. Start by uploading your first photo above.</p>
      </div>
    )
  }

  const handleDragStart = (photo, index) => {
    setDraggedPhoto({ photo, originalIndex: index })
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = async (e, targetIndex) => {
    e.preventDefault()
    setDragOverIndex(null)

    if (!draggedPhoto || draggedPhoto.originalIndex === targetIndex) {
      setDraggedPhoto(null)
      return
    }

    const reordered = [...photos]
    const [movedPhoto] = reordered.splice(draggedPhoto.originalIndex, 1)
    reordered.splice(targetIndex, 0, movedPhoto)

    const updates = reordered.map((photo, idx) => ({
      photoId: photo.id,
      sortOrder: idx + 1,
    }))

    await onReorder(updates)
    setDraggedPhoto(null)
  }

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
      <h3 className="mb-4 text-lg font-semibold text-white">Photo Gallery</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            draggable
            onDragStart={() => handleDragStart(photo, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragLeave={() => setDragOverIndex(null)}
            className={`relative overflow-hidden rounded-2xl border-2 transition ${
              dragOverIndex === index
                ? 'border-green-400 bg-green-500/10'
                : photo.is_featured
                  ? 'border-amber-400/50'
                  : 'border-white/10'
            } ${draggedPhoto?.originalIndex === index ? 'opacity-50' : ''}`}
          >
            {/* Image container */}
            <div className="aspect-square w-full overflow-hidden bg-slate-800">
              <img
                src={photo.image_url}
                alt={photo.title || 'Gallery photo'}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Featured badge */}
            {photo.is_featured && (
              <div className="absolute top-2 left-2 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
                ★ Featured
              </div>
            )}

            {/* Overlay with actions */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition hover:opacity-100">
              {!photo.is_featured && (
                <button
                  type="button"
                  onClick={() => onSetHero(photo.id)}
                  disabled={deleteInProgress.has(photo.id)}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set as Featured
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                disabled={deleteInProgress.has(photo.id)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteInProgress.has(photo.id) ? 'Deleting...' : 'Delete'}
              </button>
            </div>

            {/* Photo info */}
            {photo.title && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-3 py-2 backdrop-blur-sm">
                <p className="text-sm font-semibold text-white truncate">{photo.title}</p>
              </div>
            )}

            {/* Drag hint */}
            {draggedPhoto?.originalIndex !== index && (
              <div className="absolute top-2 right-2 text-xs text-slate-300 opacity-50">
                ⋮⋮
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">Drag and drop to reorder photos.</p>
    </div>
  )
}

export default function GroundMediaPage() {
  const { publicGroundId } = useParams()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadError, setUploadError] = useState(null)
  const [uploadInProgress, setUploadInProgress] = useState(false)
  const [deleteInProgress, setDeleteInProgress] = useState(new Set())
  const [generalError, setGeneralError] = useState(null)

  const loadPhotos = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true)
        setGeneralError(null)
        return fetchGroundPhotos(publicGroundId)
      })
      .then((data) => setPhotos(data))
      .catch((err) => setGeneralError(err.response?.data?.error || "Couldn't load photos."))
      .finally(() => setLoading(false))
  }, [publicGroundId])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  const handleUpload = async (file, options) => {
    setUploadInProgress(true)
    setUploadError(null)

    try {
      const newPhoto = await uploadGroundPhoto(publicGroundId, file, options)
      setPhotos(prev => [...prev, newPhoto])
      return true
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Failed to upload photo.')
      return false
    } finally {
      setUploadInProgress(false)
    }
  }

  const handleDelete = async (photoId) => {
    setDeleteInProgress(prev => new Set([...prev, photoId]))

    try {
      await deleteGroundPhoto(publicGroundId, photoId)
      setPhotos(prev => prev.filter(p => p.id !== photoId))
    } catch (err) {
      setGeneralError(err.response?.data?.error || 'Failed to delete photo.')
    } finally {
      setDeleteInProgress(prev => {
        const next = new Set(prev)
        next.delete(photoId)
        return next
      })
    }
  }

  const handleSetHero = async (photoId) => {
    try {
      await setHeroPhoto(publicGroundId, photoId)
      setPhotos(prev =>
        prev.map(p =>
          p.id === photoId
            ? { ...p, is_featured: true }
            : { ...p, is_featured: false }
        )
      )
    } catch (err) {
      setGeneralError(err.response?.data?.error || 'Failed to set featured photo.')
    }
  }

  const handleReorder = async (updates) => {
    try {
      const reordered = await reorderGroundPhotos(publicGroundId, updates)
      setPhotos(reordered)
    } catch (err) {
      setGeneralError(err.response?.data?.error || 'Failed to reorder photos.')
      // Reload to correct state
      loadPhotos()
    }
  }

  return (
    <GroundOwnerLayout>
      <div className="lg:flex lg:items-start lg:gap-6">
        <GroundNavTabs />

        <div className="min-w-0 flex-1">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Photos & Gallery</h1>
        <p className="mt-2 text-slate-400">Manage your ground's photo gallery, set a featured image, and reorder photos.</p>
      </div>

      {generalError && (
        <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-rose-300">
          {generalError}
        </div>
      )}

      <div className="space-y-6">
        <PhotoUploadForm
          onUpload={handleUpload}
          uploading={uploadInProgress}
          error={uploadError}
        />

        <PhotoGrid
          photos={photos}
          onDelete={handleDelete}
          onSetHero={handleSetHero}
          onReorder={handleReorder}
          loading={loading}
          deleteInProgress={deleteInProgress}
        />
      </div>
        </div>
      </div>
    </GroundOwnerLayout>
  )
}
