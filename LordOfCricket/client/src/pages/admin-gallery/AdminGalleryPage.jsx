import { Trash2, Upload, EyeOff, Eye } from 'lucide-react'
import { useAdminGallery } from '../../hooks/useAdminGallery.js'

// Manages the Cloudinary + MongoDB gallery pipeline (server/src/routes/galleryImage.routes.js).
// Distinct from /admin/photos, which still manages the older Postgres-backed
// ground_photos table — not touched by this page.
export default function AdminGalleryPage() {
  const {
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
  } = useAdminGallery()

  return (
    <div className="min-h-screen bg-emerald-950 px-6 py-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <div>
          <h1 className="text-3xl font-bold text-white">Manage Gallery (Ground Photos)</h1>
          <p className="mt-1 text-sm text-emerald-100/50">
            Uploads go to Cloudinary; metadata is stored in MongoDB. Only staff accounts can upload or delete.
          </p>
        </div>

        <form
          onSubmit={handleUpload}
          className="flex flex-col gap-4 rounded-2xl border border-emerald-400/15 bg-white/5 p-6"
        >
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/70">Photo</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files[0])}
              className="rounded-lg border border-emerald-400/20 bg-emerald-950/50 px-3 py-2 text-sm text-white file:mr-4 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-emerald-950"
              required
            />
            <p className="text-xs text-emerald-100/40">JPEG, PNG, or WEBP, up to 10MB.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-emerald-100/70">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Main Ground — Evening"
              className="rounded-lg border border-emerald-400/20 bg-emerald-950/50 px-3 py-2 text-sm text-white placeholder:text-emerald-100/30"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !file || !title.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-linear-to-r from-emerald-400 to-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-md shadow-emerald-500/30 transition-all hover:shadow-emerald-400/50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {submitting ? 'Uploading…' : 'Upload Photo'}
          </button>
        </form>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Gallery Images {loading ? '' : `(${images.length})`}
          </h2>

          {loading ? (
            <p className="text-emerald-100/60">Loading…</p>
          ) : images.length === 0 ? (
            <p className="text-emerald-100/60">
              {loadError ? loadError : 'No gallery images yet — upload one above.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`group relative overflow-hidden rounded-xl border ${
                    image.isActive ? 'border-emerald-400/15' : 'border-white/10 opacity-50'
                  }`}
                >
                  <img src={image.imageUrl} alt={image.title || 'Gallery photo'} className="h-32 w-full object-cover" />

                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(image)}
                      aria-label={image.isActive ? 'Hide from gallery' : 'Show in gallery'}
                      className="rounded-full bg-emerald-950/90 p-1.5 text-white"
                    >
                      {image.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(image.id)}
                      aria-label="Delete photo"
                      className="rounded-full bg-red-500/90 p-1.5 text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {image.title && (
                    <p className="truncate bg-emerald-950/80 px-2 py-1 text-xs text-emerald-100">{image.title}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
