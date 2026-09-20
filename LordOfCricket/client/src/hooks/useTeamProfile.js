import { useCallback, useEffect, useState } from 'react'
import { fetchTeamProfile } from '../services/publicTeamApi.js'

/** Loads the public team profile read model. Always hits the
 * server — no localStorage, no client-side cricket calculation (same
 * contract as useMatchSummary.js). */
export function useTeamProfile(teamId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    return fetchTeamProfile(teamId)
      .then((data) => {
        setProfile(data)
        setError(null)
      })
      .catch((err) => setError(err.response?.status === 404 ? 'Team not found.' : err.response?.data?.message || "Couldn't load this team."))
      .finally(() => setLoading(false))
  }, [teamId])

  useEffect(() => {
    load()
  }, [load])

  const retry = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  return { profile, loading, error, retry }
}
