import { useCallback, useEffect, useState } from 'react'
import { fetchPendingUmpireRequests, decideUmpireRequest } from '../services/umpireApi.js'

export function useAdminUmpireRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRequests = useCallback(async () => {
    try {
      const data = await fetchPendingUmpireRequests()
      setRequests(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load umpire requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRequests])

  const handleDecide = async (request, status) => {
    const verb = status === 'approved' ? 'Approve' : 'Reject'
    if (!window.confirm(`${verb} ${request.name} as an Umpire?`)) {
      return
    }

    setError('')
    try {
      await decideUmpireRequest(request.id, status)
      await loadRequests()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update umpire request.')
    }
  }

  return { requests, loading, error, handleDecide, refresh: loadRequests }
}
