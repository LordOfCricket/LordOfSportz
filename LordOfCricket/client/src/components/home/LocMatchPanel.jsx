import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useHomeDiscovery } from '../../hooks/useHomeDiscovery.js'
import LiveDot from './LiveDot.jsx'
import { PanelSurface, PanelSkeleton, PanelError } from './PanelStates.jsx'

// Every number here (runs/wickets/overs/chase/result) is already computed
// server-side by buildMatchCard.js — same read model FeaturedLiveMatch.jsx
// and MatchCard.jsx use below the hero. This panel only formats/restyles
// it for the hero's 2:1 composition; it never recalculates a score.

function chaseLine(chase) {
  if (!chase) return null
  const rrr = chase.requiredRunRate != null ? ` (RRR ${chase.requiredRunRate.toFixed(2)})` : ''
  return `Need ${chase.runsNeeded}${chase.ballsRemaining != null ? ` from ${chase.ballsRemaining} balls` : ''}${rrr}`
}

function LiveLocMatch({ match, className }) {
  const innings1 = match.innings.find((i) => i.inningsNumber === 1) || null
  const innings2 = match.innings.find((i) => i.inningsNumber === 2) || null
  const battingNow = innings2 ?? innings1
  const battingTeam =
    battingNow?.battingTeamId === match.teamA.id ? match.teamA : battingNow?.battingTeamId === match.teamB.id ? match.teamB : null
  const otherTeam = battingTeam?.id === match.teamA.id ? match.teamB : match.teamA
  const chaseText = chaseLine(match.chase)

  return (
    <PanelSurface className={className}>
      <div className="flex items-center justify-between">
        <span className="font-loc-display text-xs font-bold tracking-[0.18em] text-loc-gold uppercase">Live at LOC</span>
        <LiveDot />
      </div>

      {battingTeam && battingNow && (
        <div className="mt-3">
          <p className="truncate font-loc-body text-sm font-medium text-loc-warmwhite/80">{battingTeam.name}</p>
          <p className="font-loc-display text-4xl leading-none font-extrabold text-loc-warmwhite tabular-nums">
            {battingNow.runs}
            <span className="text-loc-grass">/{battingNow.wickets}</span>
          </p>
          <p className="mt-1 font-loc-body text-xs text-loc-text2-dark">{battingNow.oversLabel} Overs</p>
        </div>
      )}

      <p className="mt-2 font-loc-body text-xs text-loc-text2-dark">
        vs <span className="text-loc-warmwhite/70">{otherTeam?.name}</span>
      </p>

      {chaseText && <p className="mt-2 font-loc-body text-xs font-semibold text-loc-gold">Target {match.chase.target} · {chaseText}</p>}

      <Link
        to={`/matches/${match.id}/summary`}
        className="mt-4 inline-flex items-center gap-1.5 font-loc-display text-xs font-semibold tracking-wide text-loc-warmwhite/90 uppercase transition-colors hover:text-loc-gold"
      >
        View Match
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </PanelSurface>
  )
}

function ResultRow({ team, inningsEntry }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="truncate font-loc-body text-xs text-loc-warmwhite/75">{team.name}</p>
      <p className="shrink-0 font-loc-display text-sm font-bold text-loc-warmwhite tabular-nums">
        {inningsEntry ? (
          <>
            {inningsEntry.runs}
            <span className="text-loc-text2-dark">/{inningsEntry.wickets}</span>
          </>
        ) : (
          <span className="text-loc-text2-dark">—</span>
        )}
      </p>
    </div>
  )
}

function LocMatchSummary({ last, upcoming, className }) {
  if (!last && !upcoming) {
    return (
      <PanelSurface className={`items-center justify-center text-center ${className}`}>
        <p className="font-loc-display text-xs font-bold tracking-[0.18em] text-loc-gold uppercase">LOC Ground</p>
        <p className="mt-2 font-loc-body text-sm text-loc-text2-dark">No recent match activity yet.</p>
      </PanelSurface>
    )
  }

  const lastInnings1 = last?.innings.find((i) => i.inningsNumber === 1) || null
  const lastInnings2 = last?.innings.find((i) => i.inningsNumber === 2) || null

  return (
    <PanelSurface className={`gap-4 ${className}`}>
      {last && (
        <div>
          <p className="font-loc-display text-[11px] font-bold tracking-[0.18em] text-loc-text2-dark uppercase">Last Match</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <ResultRow team={last.teamA} inningsEntry={last.teamA.id === lastInnings1?.battingTeamId ? lastInnings1 : last.teamA.id === lastInnings2?.battingTeamId ? lastInnings2 : null} />
            <ResultRow team={last.teamB} inningsEntry={last.teamB.id === lastInnings1?.battingTeamId ? lastInnings1 : last.teamB.id === lastInnings2?.battingTeamId ? lastInnings2 : null} />
          </div>
          {last.result && <p className="mt-2 font-loc-body text-xs font-semibold text-loc-grass">{last.result.text}</p>}
        </div>
      )}

      {last && upcoming && <div className="border-t border-white/8" />}

      {upcoming && (
        <div>
          <p className="font-loc-display text-[11px] font-bold tracking-[0.18em] text-loc-text2-dark uppercase">Up Next</p>
          <p className="mt-2 font-loc-body text-sm font-medium text-loc-warmwhite">
            {upcoming.teamA.name} <span className="text-loc-text2-dark">vs</span> {upcoming.teamB.name}
          </p>
          <Link
            to={`/matches/${upcoming.id}/summary`}
            className="mt-2 inline-flex items-center gap-1.5 font-loc-display text-xs font-semibold tracking-wide text-loc-warmwhite/90 uppercase transition-colors hover:text-loc-gold"
          >
            Match Details
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}
    </PanelSurface>
  )
}

export default function LocMatchPanel({ className = '' }) {
  const { data, loading, error } = useHomeDiscovery()

  if (loading) return <PanelSkeleton className={className} />
  if (error || !data) return <PanelError className={className} message={error || "Couldn't load ground match info."} />

  return data.featuredLiveMatch ? (
    <LiveLocMatch match={data.featuredLiveMatch} className={className} />
  ) : (
    <LocMatchSummary last={data.recentResults[0] ?? null} upcoming={data.upcomingMatches[0] ?? null} className={className} />
  )
}
