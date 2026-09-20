import { useState } from 'react'
import { Star } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.js'
import { useUmpireProfile } from '../../hooks/useUmpireProfile.js'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import { experienceLabel, hasEnoughDataForTrend } from '../../models/umpireReputation.model.js'

export default function UmpireProfilePage() {
  const { user } = useAuth()
  const { profile, loading, error, saving, setAvailable, saveBio, refresh } = useUmpireProfile()
  const [bioDraft, setBioDraft] = useState('')
  // Seeds bioDraft from the profile the first time it loads — adjusting
  // state during render (not inside useEffect) per React's own guidance for
  // "reset/derive state from a prop that just arrived", avoiding the
  // extra-render-then-setState pattern an effect would need here.
  const [seededFor, setSeededFor] = useState(null)
  if (profile && seededFor !== profile.user_id) {
    setSeededFor(profile.user_id)
    setBioDraft(profile.bio || '')
  }

  const bioChanged = profile && bioDraft !== (profile.bio || '')

  return (
    <UmpireLayout title="My Profile">
      {loading && <StatsLoadingGrid tiles={3} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && profile && (
        <div className="space-y-6">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Profile</h2>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Name</p>
                <p className="mt-1 text-base text-white">{user?.name}</p>
              </div>

              <ReputationBadges verified={profile.verified} badges={profile.badges} />

              {experienceLabel(profile.experienceYears) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Experience</p>
                  <p className="mt-1 text-base text-white">{experienceLabel(profile.experienceYears)}</p>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bio</span>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Tell organizers a bit about your umpiring experience."
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                />
                {bioChanged && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => saveBio(bioDraft)}
                    className="mt-2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Bio'}
                  </button>
                )}
              </label>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Available for assignments</p>
                  <p className="text-xs text-slate-400">Toggle off if you're not currently taking new umpire assignments.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.is_available}
                  disabled={saving}
                  onClick={() => setAvailable(!profile.is_available)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    profile.is_available ? 'bg-emerald-500' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${
                      profile.is_available ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Statistics</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatTile label="Matches Officiated" value={profile.matches_officiated} emphasis />
              <StatTile label="Upcoming Assignments" value={profile.upcoming_assignments} />
              <StatTile label="Cancelled" value={profile.matches_cancelled} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Rating</h2>
            {/* U6 — profile.rating_avg/rating_count are real, recomputed from
                match_feedback_umpire_ratings on every new submission (never
                fabricated). rating_count === 0 means genuinely no feedback
                yet, shown honestly rather than a placeholder star value. */}
            {profile.rating_count > 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-2xl font-bold text-amber-300">
                  <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                  {Number(profile.rating_avg).toFixed(2)}
                </span>
                <span className="text-sm text-slate-400">
                  from {profile.rating_count} review{profile.rating_count === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not available yet — no umpire feedback has been submitted for you.</p>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Rating Trend</h2>
            {/* Last up to 5 individual ratings, oldest -> newest — never a
                fabricated month-bucketed trend, and never implied as
                statistically meaningful from a single review. */}
            {hasEnoughDataForTrend(profile.recentRatings) ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {profile.recentRatings.map((r, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {Number(r.rating).toFixed(1)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
            )}
          </div>
        </div>
      )}
    </UmpireLayout>
  )
}
