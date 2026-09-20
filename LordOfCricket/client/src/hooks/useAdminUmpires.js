import { useEffect, useState } from 'react'
import { fetchAdminUmpires } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "Umpires" (§5 sidebar).
export function useAdminUmpires() {
  const [umpires, setUmpires] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminUmpires()
      .then(setUmpires)
      .catch(() => setError('Unable to load umpires.'))
      .finally(() => setLoading(false))
  }, [])

  return { umpires, loading, error }
}
