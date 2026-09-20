import { Link } from 'react-router-dom'
import { MapPin, CalendarDays } from 'lucide-react'
import { formatMatchDate, formatMatchTime, statusLabel } from '../../models/matchDiscovery.model.js'
import { canCancelAssignment, canEnterScoring, isAssignmentLocked } from '../../models/umpireDashboard.model.js'

// Status now reflects real history (ASSIGNED/COMPLETED/
// CANCELLED/NO_SHOW), not just "Assigned" forever.
const SLOT_STATUS_LABEL = {
  ASSIGNED: 'Assigned',
  COMPLETED: 'Officiated',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-Show',
}

export default function AssignmentCard({ assignment, cancelling, onCancel, compact = false, showActions = true }) {
  const isLive = assignment.match_status === 'live'
  const isCompleted = assignment.status === 'COMPLETED'

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-5 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">
            {assignment.team_a_name} vs {assignment.team_b_name}
          </p>
          {!compact && (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              {assignment.ground_name && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-300" />
                  <span className="truncate">{assignment.ground_name}</span>
                </p>
              )}
              <p className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-emerald-300" />
                {isLive ? 'Live now' : `${formatMatchDate(assignment.match_date)} · ${formatMatchTime(assignment.match_date)}`}
              </p>
            </div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
            isLive ? 'animate-pulse bg-rose-500/20 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
          }`}
        >
          {isLive ? 'Live' : statusLabel({ status: assignment.match_status })}
        </span>
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Status: {SLOT_STATUS_LABEL[assignment.status] || assignment.status}
      </p>
      {assignment.status === 'CANCELLED' && (
        <p className="mt-1 text-xs text-slate-400">
          {assignment.match_status === 'cancelled'
            ? `The ground owner cancelled this match${assignment.cancellation_reason ? ` — ${assignment.cancellation_reason}` : '.'}`
            : `You cancelled this assignment${assignment.cancellation_reason ? ` — ${assignment.cancellation_reason}` : '.'}`}
        </p>
      )}

      {showActions && (
      <div className="mt-4 flex flex-wrap gap-3">
        {canEnterScoring(assignment) && (
          <Link
            to={`/matches/${assignment.match_id}/score`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-linear-to-r from-green-700 via-green-500 to-lime-500 px-5 text-sm font-semibold text-white shadow-md shadow-green-900/40 transition-all hover:brightness-110"
          >
            Enter Scoring
          </Link>
        )}
        {assignment.status === 'ASSIGNED' && assignment.match_status === 'upcoming' && (
          <Link
            to={`/umpire/matches/${assignment.match_id}/briefing`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-emerald-400/30 px-5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10"
          >
            Match Briefing
          </Link>
        )}
        {assignment.match_status === 'upcoming' && (
          <Link
            to={`/matches/${assignment.match_id}/setup`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
          >
            View Match
          </Link>
        )}
        {isCompleted && (
          <>
            <Link
              to={`/matches/${assignment.match_id}/summary`}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
            >
              View Result
            </Link>
            <Link
              to={`/matches/${assignment.match_id}/feedback`}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-emerald-400/30 px-5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10"
            >
              Feedback
            </Link>
          </>
        )}
        {canCancelAssignment(assignment) ? (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel(assignment)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-rose-400/30 px-5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel Assignment'}
          </button>
        ) : isLive ? (
          <p className="flex-1 self-center text-xs text-slate-500">Cancellation unavailable once a match is live.</p>
        ) : (
          assignment.status === 'ASSIGNED' &&
          assignment.match_status === 'upcoming' &&
          isAssignmentLocked(assignment.match_date) && (
            <p className="flex-1 self-center text-xs text-slate-500">
              Assignment locked — within 24 hours of the match, contact the ground owner if you can no longer officiate.
            </p>
          )
        )}
      </div>
      )}
    </div>
  )
}
