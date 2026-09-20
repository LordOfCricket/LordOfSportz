import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, X } from 'lucide-react'

// Full-size lightbox for one photo, layered above the grid (higher z-index)
// — clicking a thumbnail opens the original image, not a cropped tile.
// Prev/next cycle through the same `photos` array the grid shows.
function Lightbox({ photos, index, onClose, onPrev, onNext, groundName }) {
  const photo = photos[index]

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onPrev()
      if (event.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, onPrev, onNext])

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-6 w-6" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:left-4"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:right-4"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        </>
      )}

      {/* Stop propagation so clicking the image itself doesn't close the lightbox. */}
      <img
        src={photo.imageUrl}
        alt={photo.title ? `${photo.title} — ${groundName}` : groundName}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  )
}

// Moved out of the ground homepage's scrollable body and into a full-screen
// overlay, triggered from the navbar's "Gallery" button instead of an
// in-page section + anchor scroll. A masonry grid, not a sliding carousel —
// every photo visible at once in its natural aspect ratio; clicking one
// opens it full-size in the Lightbox above.
export default function GalleryModal({ open, onClose, photos = [], groundName }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  // Resets lightboxIndex itself (rather than reacting to `open` via a
  // second effect) so re-opening the gallery never starts back inside the
  // lightbox — every path that closes the gallery goes through this one
  // handler.
  const handleClose = () => {
    setLightboxIndex(null)
    onClose()
  }

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && lightboxIndex === null) handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lightboxIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-loc-surface">
      <div className="flex items-center justify-between border-b border-loc-border px-6 py-4 sm:px-10">
        <h2 className="text-lg font-bold text-loc-navy sm:text-xl">{groundName} — Gallery</h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="rounded-full p-2 text-loc-faint transition-colors hover:bg-loc-mint hover:text-loc-navy"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 sm:p-10">
        {photos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-loc-faint">
            <ImageIcon className="h-10 w-10" aria-hidden="true" />
            <p>No photos yet.</p>
          </div>
        ) : (
          // Masonry via CSS columns, not a CSS grid — each photo keeps its
          // natural aspect ratio (no aspect-square/object-cover crop), like
          // Google Photos/Images: full images of varying heights packed into
          // columns, not uniform cropped tiles.
          <div className="mx-auto max-w-7xl columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
            {photos.map((photo, i) => (
              <button
                key={photo.imageUrl}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-loc-border bg-loc-mint sm:mb-4"
              >
                <img
                  src={photo.imageUrl}
                  alt={photo.title ? `${photo.title} — ${groundName}` : groundName}
                  loading="lazy"
                  className="h-auto w-full object-contain transition-transform duration-300 hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          groundName={groundName}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i - 1 + photos.length) % photos.length)}
          onNext={() => setLightboxIndex((i) => (i + 1) % photos.length)}
        />
      )}
    </div>
  )
}
