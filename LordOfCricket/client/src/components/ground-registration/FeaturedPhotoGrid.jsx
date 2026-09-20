import { useRef, useState } from 'react'
import { Camera, X, ImagePlus } from 'lucide-react'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const REQUIRED_COUNT = 6

function Slot({ index, photo, busy, onPick, onRemove }) {
  const inputRef = useRef(null)

  return (
    <div className="group relative aspect-video overflow-hidden rounded-2xl border border-loc-border bg-loc-mint">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_PHOTO_TYPES.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
        className="hidden"
      />
      {photo ? (
        <>
          <img src={photo.url} alt={`Featured ${index + 1}`} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-loc-mint px-3 py-1.5 text-xs font-semibold text-loc-navy hover:bg-loc-border-soft disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" /> Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-red-500/70 px-3 py-1.5 text-xs font-semibold text-loc-navy backdrop-blur-sm hover:bg-red-500/90 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-full w-full flex-col items-center justify-center gap-2 text-loc-faint transition-colors hover:text-loc-muted/80 disabled:opacity-50"
        >
          <ImagePlus className="h-6 w-6" />
          <span className="text-xs font-semibold">Photo {index + 1}</span>
        </button>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
    </div>
  )
}

// Exactly 6 fixed slots for the mandatory slideshow set — slot position IS
// the sort order (§5's brief explicitly permits skipping drag-to-reorder
// since no drag library exists anywhere in this codebase; a Replace-in-
// place per numbered slot satisfies preview/replace/remove without one).
// `photos` is an array of exactly 6 entries, each either null or
// { url, publicId } (already-uploaded — see onUploadSlot). Aspect-video
// (16:9) matches the brief's "rectangular presentation suitable for the
// LOC slideshow" requirement directly via the CSS aspect-ratio, not a
// server-side crop.
export default function FeaturedPhotoGrid({ photos, onUploadSlot, onRemoveSlot, error }) {
  const [busyIndex, setBusyIndex] = useState(null)

  const filledCount = photos.filter(Boolean).length

  const handlePick = async (index, file) => {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      onUploadSlot(index, null, 'Only JPEG, PNG, or WEBP images are allowed.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      onUploadSlot(index, null, 'Image must be 10MB or smaller.')
      return
    }
    setBusyIndex(index)
    try {
      await onUploadSlot(index, file)
    } finally {
      setBusyIndex(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-loc-muted/80">Featured Photos</span>
        <span className={`text-xs font-bold ${filledCount === REQUIRED_COUNT ? 'text-loc-green' : 'text-amber-700'}`}>{filledCount} / {REQUIRED_COUNT}</span>
      </div>
      <p className="text-xs text-loc-faint">These 6 photos power the main slideshow on your ground's public page. All 6 are required.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, i) => (
          <Slot key={i} index={i} photo={photo} busy={busyIndex === i} onPick={(file) => handlePick(i, file)} onRemove={() => onRemoveSlot(i)} />
        ))}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}
