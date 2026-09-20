import { useCallback, useState } from 'react'
import { createTeamBooking, fetchTeamBookingDetail, cancelTeamBooking } from '../services/teamBookingApi.js'

// Hook for player team booking: create a MATCH or PRACTICE booking for the current player's team.
export function useTeamBooking(publicGroundId) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)
  const [details, setDetails] = useState({})
  const [busyId, setBusyId] = useState(null)

  const create = useCallback(
    async (payload) => {
      if (!publicGroundId) return false
      setLoading(true)
      setError('')
      try {
        const created = await createTeamBooking(publicGroundId, payload)
        setBooking(created)
        return true
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to create this booking.')
        return false
      } finally {
        setLoading(false)
      }
    },
    [publicGroundId]
  )

  const fetchDetail = useCallback(
    async (publicBookingId) => {
      if (!publicGroundId || !publicBookingId) return
      try {
        const detail = await fetchTeamBookingDetail(publicGroundId, publicBookingId)
        setDetails((prev) => ({ ...prev, [publicBookingId]: detail }))
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to load booking details.')
      }
    },
    [publicGroundId]
  )

  const cancel = useCallback(
    async (publicBookingId) => {
      if (!publicGroundId) return false
      setBusyId(publicBookingId)
      setError('')
      try {
        const cancelled = await cancelTeamBooking(publicGroundId, publicBookingId)
        setDetails((prev) => ({ ...prev, [publicBookingId]: cancelled }))
        return true
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Unable to cancel this booking.')
        return false
      } finally {
        setBusyId(null)
      }
    },
    [publicGroundId]
  )

  return { booking, details, loading, error, busyId, create, fetchDetail, cancel }
}
