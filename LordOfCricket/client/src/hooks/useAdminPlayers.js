import { useEffect, useState } from 'react'
import { fetchAdminPlayers } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "Players" (§5 sidebar).
export function useAdminPlayers() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminPlayers()
      .then(setPlayers)
      .catch(() => setError('Unable to load players.'))
      .finally(() => setLoading(false))
  }, [])

  return { players, loading, error }
}
