import { useCallback, useEffect, useState } from 'react'
import { fetchUmpireOperationsSummary } from '../services/groundOwnerApi.js'

// Umpire Intelligence & Scale 2.0, Workstream J — one summary per ground,
// fetched once the ground is known (not per-match).
export function useUmpireOperationsSummary(publicGroundId) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    try {
      const data = await fetchUmpireOperationsSummary(publicGroundId)
      setSummary(data)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load umpire operations summary.')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { summary, loading, error, refresh: load }
}
