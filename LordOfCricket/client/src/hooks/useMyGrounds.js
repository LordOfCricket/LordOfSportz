import { useCallback, useEffect, useState } from 'react'
import { fetchMyGrounds } from '../services/groundOwnerApi.js'

export function useMyGrounds() {
  const [grounds, setGrounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setGrounds(await fetchMyGrounds())
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load your grounds.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { grounds, loading, error, refresh: load }
}
