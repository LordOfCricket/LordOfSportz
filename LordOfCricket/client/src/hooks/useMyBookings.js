import { useCallback, useEffect, useState } from 'react'
import { fetchMyBookings, cancelBooking } from '../services/bookingApi.js'

export function useMyBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchMyBookings()
      .then(setBookings)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load your bookings.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const cancel = async (publicBookingId) => {
    setCancellingId(publicBookingId)
    setError('')
    try {
      await cancelBooking(publicBookingId)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to cancel this booking.')
    } finally {
      setCancellingId(null)
    }
  }

  // Deliberately impure (same precedent as LiveStatusBar.jsx): a
  // presentation-only upcoming/history split, never treated as booking
  // correctness — cancellation eligibility is always re-validated server-side.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const upcoming = bookings.filter((b) => b.status === 'CONFIRMED' && new Date(b.startTime).getTime() >= now).sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
  const history = bookings.filter((b) => b.status === 'CANCELLED' || new Date(b.startTime).getTime() < now).sort((a, b) => new Date(b.startTime) - new Date(a.startTime))

  return { loading, error, upcoming, history, cancel, cancellingId, retry: load }
}
