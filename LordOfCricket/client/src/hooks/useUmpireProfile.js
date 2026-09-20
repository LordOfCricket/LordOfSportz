import { useCallback, useEffect, useState } from 'react'
import { fetchMyUmpireProfile, updateMyUmpireProfile } from '../services/umpireSelfApi.js'

export function useUmpireProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setProfile(await fetchMyUmpireProfile())
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load your umpire profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  // Server-side toggle (U4 explicitly requires this, not a localStorage
  // stand-in) — it affects umpire discovery for real once a future phase
  // starts filtering by is_available, so it has to be persisted now.
  const setAvailable = async (isAvailable) => {
    setSaving(true)
    setError('')
    try {
      setProfile(await updateMyUmpireProfile({ isAvailable }))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to update your availability.')
    } finally {
      setSaving(false)
    }
  }

  const saveBio = async (bio) => {
    setSaving(true)
    setError('')
    try {
      setProfile(await updateMyUmpireProfile({ bio }))
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to save your bio.')
    } finally {
      setSaving(false)
    }
  }

  return { profile, loading, error, saving, setAvailable, saveBio, refresh: load }
}
