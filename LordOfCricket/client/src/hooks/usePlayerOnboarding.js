import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

const BIO_MAX_LENGTH = 280

// First-Login Player Profile Onboarding — one hook backing the onboarding
// page, built entirely on the existing player-profile plumbing
// (useAuth().player/refreshPlayer/savePlayer/uploadPlayerPhoto, the same
// ones ProfileEditPage already uses). Save and Skip are the same PATCH
// /me/player call underneath; Skip just omits every field except the
// completion flag, so a later visit to Edit Profile sees exactly what was
// (or wasn't) filled in here — one data path, not two.
export function usePlayerOnboarding() {
  const { user, player, refreshPlayer, savePlayer, uploadPlayerPhoto } = useAuth()
  const navigate = useNavigate()

  const [playerLoaded, setPlayerLoaded] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    refreshPlayer().finally(() => setPlayerLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Adjust state during render once the player profile has resolved (same
  // "avoid an Effect" pattern ProfileEditPage already uses) rather than a
  // render -> fetch -> render waterfall.
  if (playerLoaded && form === null) {
    setForm({
      nickname: player?.nickname ?? '',
      bio: player?.bio ?? '',
      jersey_number: player?.jersey_number ?? '',
      date_of_birth: player?.date_of_birth ?? '',
      batting_style: player?.batting_style ?? null,
      bowling_style: player?.bowling_style ?? null,
      is_wicket_keeper: player?.is_wicket_keeper ?? false,
      address_line: player?.address_line ?? '',
      city: player?.city ?? '',
      state: player?.state ?? '',
      postal_code: player?.postal_code ?? '',
      photo_url: player?.photo_url ?? '',
    })
  }

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handlePhotoUpload = async (file) => {
    const updated = await uploadPlayerPhoto(file)
    set('photo_url')(updated.photo_url)
  }

  const handlePhotoRemove = async () => {
    const updated = await savePlayer({ photo_url: null })
    set('photo_url')(updated.photo_url)
  }

  const buildPayload = () => ({
    nickname: form.nickname.trim() || null,
    bio: form.bio.trim() || null,
    jersey_number: form.jersey_number === '' ? null : Number(form.jersey_number),
    date_of_birth: form.date_of_birth || null,
    batting_style: form.batting_style,
    bowling_style: form.bowling_style,
    is_wicket_keeper: form.is_wicket_keeper,
    address_line: form.address_line.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    postal_code: form.postal_code.trim() || null,
  })

  const handleSave = async (e) => {
    e.preventDefault()
    if (saving) return
    setError('')
    if (form.jersey_number !== '' && (Number(form.jersey_number) < 0 || Number(form.jersey_number) > 999 || !Number.isInteger(Number(form.jersey_number)))) {
      setError('Jersey number must be a whole number between 0 and 999.')
      return
    }
    setSaving(true)
    try {
      await savePlayer({ ...buildPayload(), profile_onboarding_completed: true })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save your profile. Please try again.')
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (saving) return
    setError('')
    setSaving(true)
    try {
      await savePlayer({ profile_onboarding_completed: true })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return {
    user,
    form,
    set,
    saving,
    error,
    bioMaxLength: BIO_MAX_LENGTH,
    handlePhotoUpload,
    handlePhotoRemove,
    handleSave,
    handleSkip,
  }
}
