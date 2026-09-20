import { useCallback, useEffect, useState } from 'react'
import { fetchGroundReviews } from '../services/groundOwnerApi.js'

// Phase 13 — Ground Owner Reviews state management. Mirrors
// useGroundDashboard.js/useGroundAnalytics.js's shape/pattern exactly.
export function useGroundReviews(publicGroundId, page = 1) {
  const [reviews, setReviews] = useState(null)
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchGroundReviews(publicGroundId, { page })
      setReviews(data.reviews)
      setPagination(data.pagination)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId, page])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return {
    reviews,
    pagination,
    loading,
    error,
    refresh: load,
  }
}
