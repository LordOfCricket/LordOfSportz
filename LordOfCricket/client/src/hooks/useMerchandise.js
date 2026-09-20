import { useEffect, useState } from 'react'
import { getMerchandise } from '../services/merchandise.js'

// Public homepage Merchandise showcase — real GET /api/merchandise data
// only (ACTIVE / OUT_OF_STOCK products the Super Admin has published),
// same load/empty/error contract as useHallOfFame / SponsorsSection so the
// homepage degrades gracefully when there's nothing to show or the API is
// down.
export function useMerchandise() {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getMerchandise()
      .then((items) => {
        if (!cancelled) setProducts(items)
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || "Couldn't load merchandise.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { products, loading: products === null && error === null, error }
}
