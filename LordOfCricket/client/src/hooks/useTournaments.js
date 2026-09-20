import { useCallback, useEffect, useState } from 'react'
import { fetchTournaments } from '../services/tournamentApi.js'

export function useTournaments(category) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    return fetchTournaments({ category, limit: 30 })
      .then((data) => {
        setResult(data)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load tournaments."))
      .finally(() => setLoading(false))
  }, [category])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { result, loading, error, retry: load }
}
