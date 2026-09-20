import { useCallback, useEffect, useState } from 'react'
import { fetchGroundAnalytics } from '../services/groundOwnerApi.js'

// Phase 10 — Ground Owner Analytics state management. Mirrors
// useGroundDashboard.js's shape/pattern exactly.
export function useGroundAnalytics(publicGroundId, range = 'TODAY') {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchGroundAnalytics(publicGroundId, range)
      setAnalytics(data)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load analytics')
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
    analytics,
    loading,
    error,
    refresh: load,
  }
}
