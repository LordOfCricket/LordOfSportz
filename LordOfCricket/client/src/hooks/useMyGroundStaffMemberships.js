import { useCallback, useEffect, useState } from 'react'
import { fetchMyGroundStaffMemberships } from '../services/groundStaffSelf.js'

// Same fetch-on-mount posture as useIsGroundOwner.js, but returns the full
// membership list (ground/role/permissions per ground) rather than a plain
// boolean — the Staff Dashboard needs to know WHICH ground(s) and WHAT
// permissions, not just "is this account staff somewhere."
export function useMyGroundStaffMemberships(enabled = true) {
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    fetchMyGroundStaffMemberships()
      .then(setMemberships)
      .catch((err) => setError(err.response?.data?.error || 'Failed to load your ground assignments.'))
      .finally(() => setLoading(false))
  }, [enabled])

  // Deferred via setTimeout(0), same pattern as useGroundStaff.js#load — the
  // effect body itself never calls a setState function synchronously.
  useEffect(() => {
    const timer = window.setTimeout(refetch, 0)
    return () => window.clearTimeout(timer)
  }, [refetch])

  return { memberships, loading, error, refetch }
}
