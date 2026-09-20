import { CheckCircle2, Users, CalendarX } from 'lucide-react'
import { formatMatchDate, formatMatchTime, slotState } from '../../models/umpireGroundDiscovery.model.js'

// One row per match — date/time + real filled/required staffing + the
// state-derived action. The backend is authoritative for every number
// here; this component never computes availability itself, only reads it.
export default function SlotRow({ match, applying, result, onApply }) {
  const state = slotState(match)
  const opponentLine = match.teamAName && match.teamBName ? `${match.teamAShort || match.teamAName} vs ${match.teamBShort || match.teamBName}` : null

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-loc-display text-sm font-semibold tracking-wide text-loc-warmwhite">
          {formatMatchDate(match.matchDate)} · {formatMatchTime(match.matchDate)}
        </p>
        {opponentLine && <p className="mt-0.5 truncate text-xs text-loc-text2-dark">{opponentLine}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-loc-text2-dark">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {match.filledSlots} / {match.requiredUmpires}
        </span>

        {state === 'ASSIGNED' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-loc-gold/15 px-3 py-1.5 text-xs font-bold text-loc-gold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            You're Assigned
          </span>
        )}
        {state === 'SCHEDULE_CONFLICT' && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300"
            title="This overlaps another match's estimated time — an umpire can only officiate one match at a time."
          >
            <CalendarX className="h-3.5 w-3.5" aria-hidden="true" />
            Unavailable — Schedule Conflict
          </span>
        )}
        {state === 'NOT_REQUIRED' && <span className="text-xs font-medium text-loc-muted-dark">No umpire required</span>}
        {state === 'FULLY_STAFFED' && (
          <span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-loc-text2-dark">Fully Staffed</span>
        )}
        {state === 'OPEN' && (
          <button
            type="button"
            disabled={applying}
            onClick={onApply}
            className="rounded-full bg-loc-gold px-4 py-1.5 font-loc-display text-xs font-bold tracking-wide text-loc-dark uppercase shadow-md shadow-black/20 transition-colors duration-200 hover:bg-loc-warmwhite disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applying ? 'Applying…' : 'Interested for Umpiring'}
          </button>
        )}
      </div>

      {result && (
        <p className={`w-full basis-full text-xs ${result.type === 'success' ? 'text-loc-gold' : 'text-red-300'}`}>{result.text}</p>
      )}
    </li>
  )
}
