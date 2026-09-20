import { useCallback, useEffect, useState } from 'react'
import { fetchAuditLog } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "Audit Logs" (§15).
export function useAdminAuditLog() {
  const [events, setEvents] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (page = 1, type = eventType) => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchAuditLog({ eventType: type || undefined, page })
      setEvents(data.events)
      setPagination(data.pagination)
    } catch {
      setError('Unable to load the audit log.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1, eventType)
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType])

  return {
    events,
    pagination,
    loading,
    error,
    eventType,
    setEventType,
    goToPage: (page) => load(page, eventType),
  }
}
