import { useEffect, useState } from 'react'
import { fetchGalleryImages } from '../services/gallery.js'

/** Ground photos from the Cloudinary + MongoDB gallery pipeline
 * (server/src/routes/galleryImage.routes.js), already sorted by `order` and
 * filtered to active images server-side. One-shot fetch, not polled —
 * ground photography doesn't change on a live-score cadence. */
export function useGroundGallery() {
  const [photos, setPhotos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchGalleryImages({ category: 'ground' })
      .then((images) => {
        if (cancelled) return
        setPhotos(
          images.map((image) => ({
            id: image.id,
            imageUrl: image.imageUrl,
            title: image.title || null,
            alt: image.title ? `${image.title} — Lord Of Cricket ground` : 'Lord Of Cricket ground',
            order: image.order,
          })),
        )
      })
      .catch((err) => !cancelled && setError(err))
    return () => {
      cancelled = true
    }
  }, [])

  return { photos, loading: photos === null && error === null, error }
}
