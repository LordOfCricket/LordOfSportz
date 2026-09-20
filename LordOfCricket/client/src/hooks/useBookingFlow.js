import { useState } from 'react'
import { useAuth } from './useAuth.js'
import { fetchAvailability, createBooking } from '../services/bookingApi.js'
import { todayDateInputValue } from '../models/booking.model.js'

// The homepage booking modal's state machine. Every step
// re-fetches from the server — nothing here decides availability
// itself, and CONFIRM always sends the exact `startTime` instant the server
// already told this client about (never client-computed date+hour+minute
// math — see groundBooking.controller.js#resolveSlotInput).
// `publicGroundId` is optional (Ground Time-Slot Pricing) — when the caller
// knows which ground this flow is for (e.g. GroundHomePage), availability
// and the eventual booking are both scoped to that ground; omitted, this
// keeps the exact previous platform-default-ground behavior.
export function useBookingFlow(publicGroundId = null) {
  const { user } = useAuth()
  const [step, setStep] = useState('date') // date | slots | form | success | conflict
  const [dateStr, setDateStr] = useState(todayDateInputValue())
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState({ purpose: '', expectedPlayers: '', contactPhone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [alternatives, setAlternatives] = useState([])
  const [confirmedBooking, setConfirmedBooking] = useState(null)
  const [clientActionId] = useState(() => crypto.randomUUID())

  const loadSlots = async (date) => {
    setLoadingSlots(true)
    setError('')
    try {
      const result = await fetchAvailability(date, publicGroundId)
      setSlots(result)
      setStep('slots')
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load availability for that date.')
    } finally {
      setLoadingSlots(false)
    }
  }

  const chooseDate = (date) => {
    setDateStr(date)
    loadSlots(date)
  }

  const chooseSlot = (slot) => {
    setSelectedSlot(slot)
    setError('')
    setStep('form')
  }

  const chooseAlternative = (slot) => {
    setDateStr(slot.startTime.slice(0, 10))
    setSelectedSlot(slot)
    setError('')
    setStep('form')
  }

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }))

  const submit = async () => {
    if (!selectedSlot) return
    if (!user) {
      setError('Please log in to confirm a booking.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const booking = await createBooking({
        startTime: selectedSlot.startTime,
        purpose: form.purpose || null,
        expectedPlayers: form.expectedPlayers ? Number(form.expectedPlayers) : null,
        contactPhone: form.contactPhone || null,
        clientActionId,
        publicGroundId: publicGroundId || undefined,
      })
      setConfirmedBooking(booking)
      setStep('success')
    } catch (err) {
      // Ground Pricing UX Polish — PRICE_UNAVAILABLE is also a 409 (same
      // "current state blocks this action" convention as BOOKING_CONFLICT),
      // but it's not a scheduling conflict — no alternatives to suggest, and
      // the 'conflict' step's copy would be misleading here. Checked by code,
      // not status, so it never gets swept into the generic 409 branch. This
      // is a defense-in-depth path only: the slot picker already hides
      // unpriced slots, so a real user hits this only via a race (owner
      // deactivated pricing between availability fetch and confirm).
      if (err.response?.data?.code === 'PRICE_UNAVAILABLE') {
        setError(err.response.data.message)
      } else if (err.response?.status === 409) {
        setAlternatives(err.response.data.details?.alternatives || [])
        setStep('conflict')
      } else {
        setError(err.response?.data?.message || 'Unable to confirm this booking.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep('date')
    setSlots([])
    setSelectedSlot(null)
    setForm({ purpose: '', expectedPlayers: '', contactPhone: '' })
    setError('')
    setAlternatives([])
    setConfirmedBooking(null)
  }

  return {
    step,
    setStep,
    dateStr,
    setDateStr,
    slots,
    loadingSlots,
    selectedSlot,
    form,
    submitting,
    error,
    alternatives,
    confirmedBooking,
    chooseDate,
    chooseSlot,
    chooseAlternative,
    updateForm,
    submit,
    reset,
    isLoggedIn: Boolean(user),
  }
}
