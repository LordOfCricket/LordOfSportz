import { useCallback, useEffect, useState } from 'react'

// Same independently-loading shape as useAIInsight.js: the
// caller's primary page content renders immediately, this hook loads its own
// bounded section without blocking anything else.
export function useAnalytics(fetchFn, id, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const paramsKey = params ? JSON.stringify(params) : ''

  const load = useCallback(() => {
    if (!id) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    return fetchFn(id, params)
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load analytics."))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFn, id, paramsKey])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { data, loading, error }
}
