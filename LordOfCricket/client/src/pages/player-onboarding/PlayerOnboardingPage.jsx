import { Navigate } from 'react-router-dom'
import { usePlayerOnboarding } from '../../hooks/usePlayerOnboarding.js'
import Input from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import RadioCardGroup from '../../components/ui/RadioCardGroup.jsx'
import PlayerPhotoField from '../../components/player/PlayerPhotoField.jsx'
import BowlingStyleField from '../../components/player/BowlingStyleField.jsx'
import { BATTING_STYLE_LABELS } from '../../models/player.model.js'

const BATTING_OPTIONS = Object.entries(BATTING_STYLE_LABELS).map(([value, label]) => ({ value, label }))
const WICKETKEEPER_OPTIONS = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
]

function Section({ title, description, children }) {
  return (
    <div className="space-y-5 border-t border-white/10 pt-8 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// First-Login Player Profile Onboarding — reached only once, right after a
// PLAYER account's first successful login (see roleRedirect.model.js's
// getPostLoginPath). An Umpire, or anyone whose onboarding is already
// completed, is redirected away below rather than assuming route-level
// guarding elsewhere — this is a normal navigational safety net, not a new
// privileged-access gate, so it doesn't need its own RequireX guard
// component. Save and Skip both end on the LOC homepage ('/'), never
// /player/dashboard — this form never redirects there automatically.
export default function PlayerOnboardingPage() {
  const { user, form, set, saving, error, bioMaxLength, handlePhotoUpload, handlePhotoRemove, handleSave, handleSkip } = usePlayerOnboarding()

  if (user && (user.role !== 'player' || user.player_type !== 'team_player')) {
    return <Navigate to="/" replace />
  }

  if (!form) return null

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat px-4 py-10 text-white sm:px-6 lg:px-8"
      style={{
        backgroundImage: `linear-gradient(rgba(2,6,23,0.82), rgba(2,6,23,0.86)), url('/images/cricket-stadium.jpg')`,
      }}
    >
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Complete Your Player Profile</h1>
          <p className="mt-2 text-sm text-slate-300">Build your cricket profile on LOC — all of this is optional and you can finish it later.</p>
        </div>

        <form onSubmit={handleSave} className="mt-8 space-y-8 rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex justify-center">
            <PlayerPhotoField name={user?.name} photoUrl={form.photo_url} onUpload={handlePhotoUpload} onRemove={handlePhotoRemove} />
          </div>

          <Section title="Personal Information">
            <div>
              <Input label="Full Name" value={user?.name || ''} readOnly className="cursor-not-allowed opacity-70" />
              <p className="mt-1.5 text-xs text-slate-400">This is your registered name and can't be changed here.</p>
            </div>
            <Input label="Alias / Nickname" value={form.nickname} onChange={(e) => set('nickname')(e.target.value)} maxLength={50} placeholder="e.g. The Finisher" />

            <label className="block">
              <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">About</span>
              <textarea
                value={form.bio}
                onChange={(e) => set('bio')(e.target.value.slice(0, bioMaxLength))}
                maxLength={bioMaxLength}
                rows={3}
                placeholder="Right-hand batsman who enjoys aggressive cricket and contributing to the team."
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base text-white outline-none backdrop-blur-md transition-all duration-300 focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-500/20"
              />
              <p className="mt-1.5 text-right text-xs text-slate-400">
                {form.bio.length}/{bioMaxLength}
              </p>
            </label>

            <div className="grid gap-6 sm:grid-cols-2">
              <Input label="Jersey Number" type="number" min={0} max={999} value={form.jersey_number} onChange={(e) => set('jersey_number')(e.target.value)} />
              <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth')(e.target.value)} />
            </div>
          </Section>

          <Section title="Cricket Profile">
            <RadioCardGroup label="Batting Style" name="battingStyle" options={BATTING_OPTIONS} value={form.batting_style} onChange={set('batting_style')} />
            <BowlingStyleField value={form.bowling_style} onChange={set('bowling_style')} />
            <RadioCardGroup
              label="Are you a Wicketkeeper?"
              name="isWicketKeeper"
              options={WICKETKEEPER_OPTIONS}
              value={form.is_wicket_keeper ? 'YES' : 'NO'}
              onChange={(v) => set('is_wicket_keeper')(v === 'YES')}
            />
          </Section>

          <Section title="Contact / Location" description="Helps grounds and teams near you find you. Never shown publicly.">
            <Input label="Address Line" value={form.address_line} onChange={(e) => set('address_line')(e.target.value)} maxLength={255} />
            <div className="grid gap-6 sm:grid-cols-2">
              <Input label="City" value={form.city} onChange={(e) => set('city')(e.target.value)} maxLength={100} />
              <Input label="State" value={form.state} onChange={(e) => set('state')(e.target.value)} maxLength={100} />
            </div>
            <Input label="Pincode" value={form.postal_code} onChange={(e) => set('postal_code')(e.target.value)} maxLength={20} />
          </Section>

          {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-rose-300">{error}</div>}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="h-14 rounded-2xl border border-white/15 px-6 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip for Now
            </button>
            <Button type="submit" disabled={saving} className="px-8">
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}
