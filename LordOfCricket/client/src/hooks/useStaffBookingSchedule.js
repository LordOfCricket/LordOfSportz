import { useCallback, useEffect, useState } from 'react'
import { fetchStaffSchedule, cancelBooking, removeStaffBlock, fetchAvailability, createStaffBlock } from '../services/bookingApi.js'
import { todayDateInputValue, addDaysToDateStr } from '../models/booking.model.js'

export function useStaffBookingSchedule() {
  const [from, setFrom] = useState(todayDateInputValue())
  const [to, setTo] = useState(addDaysToDateStr(todayDateInputValue(), 14))
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  // Add-block sub-flow
  const [blockDate, setBlockDate] = useState(todayDateInputValue())
  const [blockSlots, setBlockSlots] = useState([])
  const [blockPurpose, setBlockPurpose] = useState('')
  const [blockType, setBlockType] = useState('')
  const [loadingBlockSlots, setLoadingBlockSlots] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    fetchStaffSchedule({ from, to })
      .then(setBookings)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load the schedule.'))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const cancelCustomerBooking = async (publicBookingId) => {
    setBusyId(publicBookingId)
    setError('')
    try {
      await cancelBooking(publicBookingId)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to cancel this booking.')
    } finally {
      setBusyId(null)
    }
  }

  const removeBlock = async (publicBookingId) => {
    setBusyId(publicBookingId)
    setError('')
    try {
      await removeStaffBlock(publicBookingId)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to remove this block.')
    } finally {
      setBusyId(null)
    }
  }

  const loadBlockSlots = async () => {
    setLoadingBlockSlots(true)
    setError('')
    try {
      const slots = await fetchAvailability(blockDate)
      setBlockSlots(slots)
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load slots for that date.')
    } finally {
      setLoadingBlockSlots(false)
    }
  }

  const addBlock = async (startTime) => {
    setError('')
    try {
      await createStaffBlock({ startTime, purpose: blockPurpose || 'Ground Block', blockType: blockType || undefined })
      setBlockSlots([])
      setBlockPurpose('')
      setBlockType('')
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create this block.')
    }
  }

  return {
    from,
    setFrom,
    to,
    setTo,
    bookings,
    loading,
    error,
    busyId,
    cancelCustomerBooking,
    removeBlock,
    blockDate,
    setBlockDate,
    blockSlots,
    loadingBlockSlots,
    loadBlockSlots,
    blockPurpose,
    setBlockPurpose,
    blockType,
    setBlockType,
    addBlock,
  }
}
