import { useEffect, useState } from 'react'
import { fetchAllStaff } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "Admin Management" (§17).
export function useAdminSettings() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAllStaff()
      .then(setStaff)
      .catch(() => setError('Unable to load admin accounts.'))
      .finally(() => setLoading(false))
  }, [])

  return { staff, loading, error }
}
