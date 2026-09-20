import { useNavigate } from 'react-router-dom'
import { CalendarDays, Check, X } from 'lucide-react'
import { useNextMatchAvailability } from '../../hooks/useNextMatchAvailability.js'
import { formatMatchDate, formatMatchTime } from '../../models/matchDiscovery.model.js'

// Real per-player match schedule + RSVP, replacing the
// previous permanent empty-state stub.
export default function NextMatchCard({ teamId }) {
  const navigate = useNavigate()
  const { match, availability, loading, updating, error, respond } = useNextMatchAvailability(teamId)

  return (
    <div id="matches" className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm scroll-mt-24">
      <h2 className="text-xl font-semibold text-white">Next Match</h2>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : match ? (
        <div className="mt-4">
          <button type="button" onClick={() => navigate(`/matches/${match.id}/summary`)} className="text-left">
            <p className="text-lg font-semibold text-white hover:text-emerald-300">
              {match.team_a_name} vs {match.team_b_name}
            </p>
            <p className="text-sm text-slate-400">
              {formatMatchDate(match.match_date)} · {formatMatchTime(match.match_date)}
              {match.venue ? ` · ${match.venue}` : ''}
            </p>
          </button>

          {availability?.eligible && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your Availability</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => respond('AVAILABLE')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    availability.status === 'AVAILABLE' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  Available
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => respond('NOT_AVAILABLE')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    availability.status === 'NOT_AVAILABLE' ? 'border-rose-400/50 bg-rose-500/20 text-rose-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <X className="h-4 w-4" />
                  Not Available
                </button>
              </div>
              {availability.status === 'PENDING' && <p className="mt-2 text-xs text-slate-400">The organizer can't see a response from you yet.</p>}
              {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
          <CalendarDays className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-300">No matches scheduled yet.</p>
        </div>
      )}
    </div>
  )
}
