import { useRef, useState } from 'react'
import { X, ImagePlus } from 'lucide-react'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_GALLERY_PHOTOS = 20

// Optional, variable-length — pitch close-ups, pavilion, nets, parking,
// etc. (brief §6). Unlike FeaturedPhotoGrid, there's no fixed slot count:
// Add appends, each thumbnail can be individually removed.
export default function GalleryPhotoUploader({ photos, onAdd, onRemove }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (photos.length >= MAX_GALLERY_PHOTOS) {
      setError(`You can add up to ${MAX_GALLERY_PHOTOS} gallery photos.`)
      return
    }
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, or WEBP images are allowed.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Image must be 10MB or smaller.')
      return
    }

    setError('')
    setUploading(true)
    try {
      await onAdd(file)
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Try a different photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-sm font-semibold text-emerald-100/80">Gallery</span>
        <span className="ml-1 text-xs font-normal text-emerald-100/40">(optional — pitch, pavilion, nets, parking, and more)</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {photos.map((photo, i) => (
          <div key={photo.publicId || i} className="group relative h-24 w-24 overflow-hidden rounded-xl border border-emerald-400/20">
            <img src={photo.url} alt={`Gallery ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <input ref={inputRef} type="file" accept={ALLOWED_PHOTO_TYPES.join(',')} onChange={handleFile} className="hidden" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || photos.length >= MAX_GALLERY_PHOTOS}
          className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-emerald-400/30 text-emerald-100/50 transition-colors hover:text-emerald-100/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[10px] font-semibold">{uploading ? 'Uploading…' : 'Add Photo'}</span>
        </button>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}
