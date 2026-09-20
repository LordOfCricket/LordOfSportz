import { useCallback, useEffect, useState } from 'react'
import { fetchGroundProfile } from '../services/groundsApi.js'

/** Fetches one ground's public profile (GET /api/grounds/:publicGroundId).
 * One-shot, not polled — a ground's profile doesn't change on a live-score
 * cadence. `notFound` is split out from `error` so callers can render a
 * dedicated "Ground Not Found" state (Step 30) instead of the
 * generic error state for a 404 specifically — an unknown id and a
 * real-but-DRAFT/SUSPENDED ground both 404 identically, so this
 * hook can't and shouldn't try to tell those two apart either.
 *
 * `loading` is DERIVED (ground/error/notFound all still unset), not its own
 * useState — matches useGroundGallery.js's existing convention and avoids
 * ever needing a synchronous setState at the top of the effect (the newer
 * react-hooks/set-state-in-effect lint rule flags that pattern). Each
 * branch (success/404/other error) fully resets all three so a
 * publicGroundId change (e.g. navigating Ground A -> Ground B without an
 * unmount) can never leave stale state from the previous ground behind. */
export function useGround(publicGroundId) {
  const [ground, setGround] = useState(null)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!publicGroundId) return undefined
    let cancelled = false

    fetchGroundProfile(publicGroundId)
      .then((data) => {
        if (cancelled) return
        setGround(
          data.ground
            ? { ...data.ground, photos: data.photos, amenities: data.amenities, amenityCatalog: data.amenityCatalog, canteens: data.canteens, gallery: data.gallery, pricingSlots: data.pricingSlots }
            : null,
        )
        setNotFound(false)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setGround(null)
        if (err.response?.status === 404) {
          setNotFound(true)
          setError(null)
        } else {
          setNotFound(false)
          setError(err.response?.data?.error || "Couldn't load this ground.")
        }
      })

    return () => {
      cancelled = true
    }
  }, [publicGroundId, reloadToken])

  const retry = useCallback(() => setReloadToken((t) => t + 1), [])
  const loading = ground === null && error === null && !notFound

  return { ground, loading, error, notFound, retry }
}
