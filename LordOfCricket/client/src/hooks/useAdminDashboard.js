import { useEffect, useState } from 'react'
import { fetchDashboardStats } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — replaces
// AdminDashboardPage's old "no API call at all" static-cards behavior with
// real backend data.
export function useAdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
      .then(setStats)
      .catch(() => setError('Unable to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  return { stats, error, loading }
}
