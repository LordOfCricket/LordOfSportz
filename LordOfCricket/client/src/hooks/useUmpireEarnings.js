import { useCallback, useEffect, useState } from 'react'
import { fetchMyEarnings } from '../services/umpireSelfApi.js'

// Umpire Communication & Commercial 2.0 — "My Earnings". Same
// setTimeout(0)-deferred initial load convention as useUmpireDashboard.js/
// useUmpireStatistics.js (avoids the set-state-in-effect lint rule).
export function useUmpireEarnings() {
  const [summary, setSummary] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchMyEarnings()
      setSummary(data.summary)
      setRecent(data.recent)
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load your earnings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { summary, recent, loading, error, refresh: load }
}
