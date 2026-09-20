import { useCallback, useEffect, useState } from 'react'
import { fetchAllGrounds, suspendGround, reactivateGround } from '../services/adminApi.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — "All Grounds" (§11).
export function useAdminAllGrounds() {
  const [grounds, setGrounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // FINAL AUDIT (P2) — only window.confirm guarded the first click; a second
  // click on a slow connection before the request resolved could re-fire
  // the same suspend/reactivate call. The backend action is already a safe
  // no-op on repeat (conditional UPDATE ... WHERE status = ...), but the UI
  // should still not invite it. Tracks the one ground currently in flight,
  // matching the existing pattern in GroundOwnersPage.jsx's password reset.
  const [actioningId, setActioningId] = useState(null)

  const load = useCallback(async () => {
    try {
      setGrounds(await fetchAllGrounds())
    } catch {
      setError('Unable to load grounds.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const handleSuspend = async (ground) => {
    if (!window.confirm(`Suspend "${ground.name}"? It will be removed from public discovery immediately.`)) return
    if (actioningId) return
    setError('')
    setActioningId(ground.publicGroundId)
    try {
      await suspendGround(ground.publicGroundId)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to suspend this ground.')
    } finally {
      setActioningId(null)
    }
  }

  const handleReactivate = async (ground) => {
    if (!window.confirm(`Reactivate "${ground.name}"? It will become publicly visible again.`)) return
    if (actioningId) return
    setError('')
    setActioningId(ground.publicGroundId)
    try {
      await reactivateGround(ground.publicGroundId)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reactivate this ground.')
    } finally {
      setActioningId(null)
    }
  }

  return { grounds, loading, error, actioningId, handleSuspend, handleReactivate }
}
