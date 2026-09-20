import { useCallback, useEffect, useState } from 'react'
import { fetchGroundTrends } from '../services/groundOwnerApi.js'

// Phase 16 — day-by-day trend series state. Mirrors useGroundAnalytics.js's
// shape/pattern exactly.
export function useGroundTrends(publicGroundId, range = 'TODAY') {
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchGroundTrends(publicGroundId, range)
      setTrends(data)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load trends')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId, range])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return {
    trends,
    loading,
    error,
    refresh: load,
  }
}
