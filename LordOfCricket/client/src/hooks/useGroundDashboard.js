import { useCallback, useEffect, useState } from 'react'
import { fetchGroundDashboard } from '../services/groundOwnerApi.js'

// Phase 9 — Ground Owner Operations Dashboard state management.
// Fetches today's and upcoming activities for a specific ground.
export function useGroundDashboard(publicGroundId) {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchGroundDashboard(publicGroundId)
      setDashboard(data)
    } catch (err) {
      // Phase 11 audit fix — the most common failure here is the
      // requireGroundRole middleware's 403/404 ({ error: '...' }), not a
      // thrown domain error ({ message: '...' }); .error must be checked
      // first or the user sees a generic axios message instead of "You do
      // not have permission..." / "Ground not found." (matches the .error
      // precedence every other Ground Owner page — e.g. GroundProfilePage —
      // already uses).
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return {
    dashboard,
    loading,
    error,
    refresh: load,
  }
}
