import { useCallback, useEffect, useState } from 'react'

// The AI section loads INDEPENDENTLY of the page's main
// content (same shape as useTeamProfile.js's own loading/error pattern):
// the caller renders the primary, deterministic page immediately and mounts
// this hook in its own bounded section, never blocking on it.
export function useAIInsight(fetchFn, id) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    if (!id) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    return fetchFn(id)
      .then((data) => {
        setResult(data)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.message || null))
      .finally(() => setLoading(false))
  }, [fetchFn, id])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { result, loading, error }
}
