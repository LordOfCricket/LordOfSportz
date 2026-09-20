import { useCallback, useEffect, useState } from 'react'
import { fetchGroundMatches, createGroundMatch, startGroundMatch, completeGroundMatch, cancelGroundMatch } from '../services/groundOwnerApi.js'

export function useGroundMatches(publicGroundId) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  // Keyed by match id — {type:'understaffed'|'error', message, filledSlots,
  // totalSlots} — lets one card show its own outcome without a global toast.
  const [lifecycleBusyId, setLifecycleBusyId] = useState(null)
  const [lifecycleResults, setLifecycleResults] = useState({})

  const load = useCallback(async () => {
    if (!publicGroundId) return
    setLoading(true)
    try {
      setMatches(await fetchGroundMatches(publicGroundId))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load matches for this ground.')
    } finally {
      setLoading(false)
    }
  }, [publicGroundId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // The backend derives ground_id from the authorized :publicGroundId route
  // context (requireGroundRole) — this never sends a groundId itself.
  const create = async ({ teamAId, teamBId, matchDate, requiredUmpires }) => {
    setCreating(true)
    setCreateError('')
    try {
      await createGroundMatch(publicGroundId, { teamAId, teamBId, matchDate, requiredUmpires })
      await load()
      return true
    } catch (err) {
      setCreateError(err.response?.data?.error || err.response?.data?.message || 'Unable to create this match.')
      return false
    } finally {
      setCreating(false)
    }
  }

  // `confirmUnderstaffed` re-sends the same request once the caller has
  // seen the soft-block (startMatch's own 409 + {understaffed,
  // filledSlots, totalSlots} — never a hard failure, matches U9's existing
  // "start anyway?" UX) and chosen to proceed anyway.
  const start = async (matchId, { confirmUnderstaffed = false } = {}) => {
    setLifecycleBusyId(matchId)
    setLifecycleResults((prev) => ({ ...prev, [matchId]: null }))
    try {
      await startGroundMatch(publicGroundId, matchId, { confirmUnderstaffed })
      await load()
      return true
    } catch (err) {
      const details = err.response?.data?.details
      if (details?.understaffed) {
        setLifecycleResults((prev) => ({ ...prev, [matchId]: { type: 'understaffed', ...details } }))
      } else {
        setLifecycleResults((prev) => ({
          ...prev,
          [matchId]: { type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Unable to start this match.' },
        }))
      }
      return false
    } finally {
      setLifecycleBusyId(null)
    }
  }

  const complete = async (matchId) => {
    setLifecycleBusyId(matchId)
    setLifecycleResults((prev) => ({ ...prev, [matchId]: null }))
    try {
      await completeGroundMatch(publicGroundId, matchId)
      await load()
      return true
    } catch (err) {
      setLifecycleResults((prev) => ({
        ...prev,
        [matchId]: { type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Unable to complete this match.' },
      }))
      return false
    } finally {
      setLifecycleBusyId(null)
    }
  }

  // Pre-match cancellation (Phase 6, Umpire Module). `reason` is optional
  // free text shown to affected umpires and stored on the match row.
  const cancel = async (matchId, reason) => {
    setLifecycleBusyId(matchId)
    setLifecycleResults((prev) => ({ ...prev, [matchId]: null }))
    try {
      await cancelGroundMatch(publicGroundId, matchId, reason)
      await load()
      return true
    } catch (err) {
      setLifecycleResults((prev) => ({
        ...prev,
        [matchId]: { type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Unable to cancel this match.' },
      }))
      return false
    } finally {
      setLifecycleBusyId(null)
    }
  }

  return {
    matches,
    loading,
    error,
    creating,
    createError,
    create,
    refresh: load,
    start,
    complete,
    cancel,
    lifecycleBusyId,
    lifecycleResults,
  }
}
