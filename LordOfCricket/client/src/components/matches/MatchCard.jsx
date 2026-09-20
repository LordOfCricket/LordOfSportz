import { useNavigate } from 'react-router-dom'
import { statusLabel, formatMatchDate, formatMatchTime, formatOversFormat } from '../../models/matchDiscovery.model.js'
import TeamBadge from '../teams/TeamBadge.jsx'
import useGlowHover from '../../hooks/useGlowHover.js'
import GlowOverlay from '../common/GlowOverlay.jsx'

// One adaptive card for all three categories,
// never three unrelated implementations. Every number shown is already
// computed server-side by buildMatchCard.js; this component only formats
// display strings.

const STATUS_BADGE_CLASS = {
  upcoming: 'bg-sky-500/15 text-sky-200',
  live: 'bg-rose-500/15 text-rose-200',
  completed: 'bg-amber-500/15 text-amber-200',
  finalized: 'bg-emerald-500/15 text-emerald-200',
}
const STATUS_BADGE_CLASS_LIGHT = {
  upcoming: 'bg-sky-100 text-sky-700',
  live: 'bg-rose-100 text-rose-700',
  completed: 'bg-amber-100 text-amber-700',
  finalized: 'bg-loc-mint text-loc-green',
}

function StatusBadge({ match, light }) {
  const label = statusLabel(match)
  const isLive = match.status === 'live' && !match.isInningsBreak
  const map = light ? STATUS_BADGE_CLASS_LIGHT : STATUS_BADGE_CLASS
  const fallback = light ? 'bg-slate-100 text-slate-600' : 'bg-white/10 text-slate-200'
  const className = match.isInningsBreak ? map.upcoming : map[match.status] || fallback
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${className}`}>
      {isLive && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />}
      {label}
    </span>
  )
}

function TeamRow({ team, inningsEntry, light }) {
  const dim = light ? 'text-loc-faint' : 'text-slate-400'
  const strong = light ? 'text-loc-navy' : 'text-white'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamBadge team={team} size="sm" />
        <p className={`truncate text-sm font-semibold ${strong}`}>{team.name}</p>
      </div>
      {inningsEntry ? (
        <p className={`shrink-0 text-sm font-bold ${strong}`}>
          {inningsEntry.runs}
          <span className={dim}>/{inningsEntry.wickets}</span>
          <span className={`ml-1 text-xs font-medium ${dim}`}>({inningsEntry.oversLabel})</span>
        </p>
      ) : (
        <p className={`shrink-0 text-xs ${dim}`}>Yet to bat</p>
      )}
    </div>
  )
}

function chaseLine(chase) {
  if (!chase) return null
  const rrr = chase.requiredRunRate != null ? ` · RRR ${chase.requiredRunRate.toFixed(2)}` : ''
  return `Need ${chase.runsNeeded}${chase.ballsRemaining != null ? ` from ${chase.ballsRemaining} balls` : ''}${rrr}`
}

export default function MatchCard({ match, light = false }) {
  const navigate = useNavigate()
  const { enabled: glowEnabled, ref: glowRef, onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } = useGlowHover()
  const innings1 = match.innings.find((i) => i.inningsNumber === 1) || null
  const innings2 = match.innings.find((i) => i.inningsNumber === 2) || null
  const chaseText = chaseLine(match.chase)

  return (
    <button
      type="button"
      onClick={() => navigate(`/matches/${match.id}/summary`)}
      ref={glowRef}
      {...(glowEnabled && !light ? { onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } : {})}
      className={`relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 sm:p-5 ${
        light
          ? 'border-loc-border bg-loc-surface shadow-loc hover:shadow-loc-md'
          : 'border-white/10 bg-slate-900/60 shadow-sm backdrop-blur-sm hover:border-emerald-400/30 hover:bg-slate-900/80'
      }`}
    >
      {glowEnabled && !light && <GlowOverlay />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge match={match} light={light} />
        <p className={`text-xs font-medium ${light ? 'text-loc-faint' : 'text-slate-400'}`}>
          {formatMatchDate(match.matchDate)}
          {match.status === 'upcoming' ? ` · ${formatMatchTime(match.matchDate)}` : ''}
          {match.venue ? ` · ${match.venue}` : ''}
          {match.status === 'upcoming' && formatOversFormat(match.format.oversPerInnings) ? ` · ${formatOversFormat(match.format.oversPerInnings)}` : ''}
        </p>
      </div>

      <div className="space-y-2">
        <TeamRow team={match.teamA} light={light} inningsEntry={match.teamA.id === innings1?.battingTeamId ? innings1 : match.teamA.id === innings2?.battingTeamId ? innings2 : null} />
        <TeamRow team={match.teamB} light={light} inningsEntry={match.teamB.id === innings1?.battingTeamId ? innings1 : match.teamB.id === innings2?.battingTeamId ? innings2 : null} />
      </div>

      {chaseText && (
        <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${light ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-200'}`}>{chaseText}</p>
      )}
      {match.result && (
        <p className={`rounded-xl px-3 py-2 text-xs font-bold ${light ? 'bg-loc-mint text-loc-green' : 'bg-emerald-500/10 text-emerald-200'}`}>{match.result.text}</p>
      )}

      <span
        className={`inline-flex items-center justify-center rounded-full border py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
          light ? 'border-loc-border text-loc-green' : 'border-white/10 text-emerald-200'
        }`}
      >
        View Match
      </span>
    </button>
  )
}
