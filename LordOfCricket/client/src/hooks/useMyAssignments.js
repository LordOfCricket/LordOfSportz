import { useCallback, useEffect, useState } from 'react'
import { fetchMyAssignments, cancelUmpireAssignment } from '../services/umpireSelfApi.js'
import { bucketAssignments, cancelErrorMessage } from '../models/umpireDashboard.model.js'

export function useMyAssignments() {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchMyAssignments()
      setAssignments(data)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load your assignments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const cancel = async (assignment) => {
    const label = `${assignment.team_a_name} vs ${assignment.team_b_name}`
    if (!window.confirm(`Cancel your umpire assignment for ${label}?`)) return

    setCancellingId(assignment.match_id)
    setError('')
    try {
      await cancelUmpireAssignment(assignment.match_id)
      await load()
    } catch (err) {
      setError(cancelErrorMessage(err.response?.data?.code, err.response?.data?.message || err.response?.data?.error))
      // The backend is authoritative — if it refused (e.g. the match went
      // live between page load and this click), reload so the UI reflects
      // reality rather than trusting the click's intent.
      await load()
    } finally {
      setCancellingId(null)
    }
  }

  return { ...bucketAssignments(assignments), loading, error, cancellingId, cancel, refresh: load }
}
