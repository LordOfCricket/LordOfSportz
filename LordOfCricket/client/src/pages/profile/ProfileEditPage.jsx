import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import Input from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/common/BackButton.jsx'
import RadioCardGroup from '../../components/ui/RadioCardGroup.jsx'
import PlayerPhotoField from '../../components/player/PlayerPhotoField.jsx'
import BowlingStyleField from '../../components/player/BowlingStyleField.jsx'
import { PLAYING_ROLE_LABELS, BATTING_STYLE_LABELS } from '../../models/player.model.js'

const BIO_MAX_LENGTH = 280
const BATTING_OPTIONS = Object.entries(BATTING_STYLE_LABELS).map(([value, label]) => ({ value, label }))
const WICKETKEEPER_OPTIONS = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
]

// First-Login Player Profile Onboarding — the progressive bowling picker
// (BowlingStyleField) and photo field with Remove (PlayerPhotoField) now
// live in components/player/ and are shared with the onboarding page; this
// file no longer keeps its own PhotoPicker/flat bowling-style Select, so
// there is exactly one implementation of each, not two that could drift.

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">{label}</span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white outline-none backdrop-blur-md transition-all duration-300 focus:border-green-400 focus:bg-white/10 focus:ring-4 focus:ring-green-500/20"
      >
        <option value="" className="bg-slate-900">
          — Not set —
        </option>
        {Object.entries(options).map(([value_, label_]) => (
          <option key={value_} value={value_} className="bg-slate-900">
            {label_}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function ProfileEditPage() {
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

  // Adjust state during render (not in an Effect) once the player profile has
  // resolved, per https://react.dev/learn/you-might-not-need-an-effect —
  // avoids the extra render-then-fetch-then-render waterfall an Effect would add.
  if (playerLoaded && form === null) {
    setForm({
      name: player?.name ?? user?.name ?? '',
      role: player?.role ?? null,
      batting_style: player?.batting_style ?? null,
      bowling_style: player?.bowling_style ?? null,
      jersey_number: player?.jersey_number ?? '',
      city: player?.city ?? '',
      bio: player?.bio ?? '',
      photo_url: player?.photo_url ?? '',
      nickname: player?.nickname ?? '',
      date_of_birth: player?.date_of_birth ?? '',
      is_wicket_keeper: player?.is_wicket_keeper ?? false,
      address_line: player?.address_line ?? '',
      state: player?.state ?? '',
      postal_code: player?.postal_code ?? '',
    })
  }

  if (!form) return null

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  // Uploaded and saved server-side immediately (its own endpoint,
  // multipart) — not bundled into the JSON PATCH the rest of the form
  // submits on Save. `form.photo_url` only exists locally to refresh the
  // preview the moment the upload resolves.
  const handlePhotoUpload = async (file) => {
    const updated = await uploadPlayerPhoto(file)
    set('photo_url')(updated.photo_url)
  }

  const handlePhotoRemove = async () => {
    const updated = await savePlayer({ photo_url: null })
    set('photo_url')(updated.photo_url)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await savePlayer({
        name: form.name.trim(),
        role: form.role,
        batting_style: form.batting_style,
        bowling_style: form.bowling_style,
        jersey_number: form.jersey_number === '' ? null : Number(form.jersey_number),
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        nickname: form.nickname.trim() || null,
        date_of_birth: form.date_of_birth || null,
        is_wicket_keeper: form.is_wicket_keeper,
        address_line: form.address_line.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null,
      })
      navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage: `linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.78)), url('/images/cricket-stadium.jpg')`,
      }}
    >
      <div className="mx-auto max-w-2xl">
        <BackButton label="Back to Profile" fallback="/profile" />

        <h1 className="mt-6 text-3xl font-bold text-white">Edit Profile</h1>
        <p className="mt-1 text-sm text-slate-300">Update your cricket identity. Statistics are derived from official matches and can't be edited here.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-rose-300">{error}</div>}

          <Input label="Display Name" value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={100} required />
          <Input label="Alias / Nickname" value={form.nickname} onChange={(e) => set('nickname')(e.target.value)} maxLength={50} placeholder="e.g. The Finisher" />

          <div className="flex justify-center">
            <PlayerPhotoField name={form.name} photoUrl={form.photo_url} onUpload={handlePhotoUpload} onRemove={handlePhotoRemove} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Select label="Playing Role" value={form.role} onChange={set('role')} options={PLAYING_ROLE_LABELS} />
            <Input
              label="Jersey Number"
              type="number"
              min={0}
              max={999}
              value={form.jersey_number}
              onChange={(e) => set('jersey_number')(e.target.value)}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Input label="City" value={form.city} onChange={(e) => set('city')(e.target.value)} maxLength={100} />
            <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth')(e.target.value)} />
          </div>

          <label className="block">
            <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">Short Bio</span>
            <textarea
              value={form.bio}
              onChange={(e) => set('bio')(e.target.value.slice(0, BIO_MAX_LENGTH))}
              maxLength={BIO_MAX_LENGTH}
              rows={3}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white outline-none backdrop-blur-md transition-all duration-300 focus:border-green-400 focus:bg-white/10 focus:ring-4 focus:ring-green-500/20"
            />
            <p className="mt-1.5 text-right text-xs text-slate-400">
              {form.bio.length}/{BIO_MAX_LENGTH}
            </p>
          </label>

          <div className="space-y-6 border-t border-white/10 pt-6">
            <RadioCardGroup label="Batting Style" name="battingStyle" options={BATTING_OPTIONS} value={form.batting_style} onChange={set('batting_style')} />
            <BowlingStyleField value={form.bowling_style} onChange={set('bowling_style')} />
            <RadioCardGroup
              label="Are you a Wicketkeeper?"
              name="isWicketKeeper"
              options={WICKETKEEPER_OPTIONS}
              value={form.is_wicket_keeper ? 'YES' : 'NO'}
              onChange={(v) => set('is_wicket_keeper')(v === 'YES')}
            />
          </div>

          <div className="space-y-6 border-t border-white/10 pt-6">
            <Input label="Address Line" value={form.address_line} onChange={(e) => set('address_line')(e.target.value)} maxLength={255} />
            <div className="grid gap-6 sm:grid-cols-2">
              <Input label="State" value={form.state} onChange={(e) => set('state')(e.target.value)} maxLength={100} />
              <Input label="Pincode" value={form.postal_code} onChange={(e) => set('postal_code')(e.target.value)} maxLength={20} />
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={saving} className="h-12 px-6">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="h-12 rounded-2xl border border-white/15 px-6 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
