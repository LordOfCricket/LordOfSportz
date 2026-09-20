import { useIndiaMatch } from '../../hooks/useIndiaMatch.js'
import { formatMatchDate, formatMatchTime } from '../../models/matchDiscovery.model.js'
import LiveDot from './LiveDot.jsx'
import { PanelSurface, PanelSkeleton, PanelError } from './PanelStates.jsx'

// External, unofficial data (server-side CricAPI integration, cached and
// proxied through OUR backend — see cricapi.service.js). Deliberately
// minimal: score only, no commentary/news/squads, per the "glance and know
// India's score" brief. Never mixed with LOC's own scoring truth.

function ScoreLine({ shortName, runs, wickets, overs, align = 'left' }) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <p className="font-loc-body text-xs font-semibold text-loc-text2-dark uppercase">{shortName}</p>
      {runs != null ? (
        <>
          <p className="font-loc-display text-3xl leading-none font-extrabold text-loc-warmwhite tabular-nums">
            {runs}
            {wickets != null && <span className="text-loc-grass">/{wickets}</span>}
          </p>
          {overs != null && <p className="mt-1 font-loc-body text-[11px] text-loc-text2-dark">{overs} Overs</p>}
        </>
      ) : (
        <p className="mt-1 font-loc-body text-xs text-loc-text2-dark">Yet to bat</p>
      )}
    </div>
  )
}

function LiveIndiaScore({ match, className }) {
  const isIndiaA = match.teamA.name === 'India'
  const india = isIndiaA ? match.teamA : match.teamB
  const other = isIndiaA ? match.teamB : match.teamA

  return (
    <PanelSurface className={className}>
      <div className="flex items-center justify-between">
        <span className="font-loc-display text-xs font-bold tracking-[0.18em] text-loc-gold uppercase">India</span>
        <LiveDot />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ScoreLine shortName={india.shortName || 'IND'} runs={india.runs} wickets={india.wickets} overs={india.overs} />
        <span className="font-loc-body text-xs text-loc-text2-dark">vs</span>
        <ScoreLine shortName={other.shortName || other.name} runs={other.runs} wickets={other.wickets} overs={other.overs} align="right" />
      </div>
    </PanelSurface>
  )
}

function UpcomingIndiaMatch({ match, className }) {
  return (
    <PanelSurface className={`items-start justify-center ${className}`}>
      <p className="font-loc-display text-xs font-bold tracking-[0.18em] text-loc-gold uppercase">India</p>
      <p className="mt-2 font-loc-display text-[11px] font-bold tracking-[0.14em] text-loc-text2-dark uppercase">Next Match</p>
      <p className="mt-1 font-loc-body text-sm font-medium text-loc-warmwhite">
        {match.teamA.name} <span className="text-loc-text2-dark">vs</span> {match.teamB.name}
      </p>
      <p className="mt-1 font-loc-body text-xs text-loc-text2-dark">
        {formatMatchDate(match.dateTimeGMT)} · {formatMatchTime(match.dateTimeGMT)}
      </p>
    </PanelSurface>
  )
}

export default function IndiaMatchPanel({ className = '' }) {
  const { match, loading, error } = useIndiaMatch()

  if (loading) return <PanelSkeleton className={className} />
  if (error) return <PanelError className={className} message={error} />
  if (!match) return null

  return match.isLive ? (
    <LiveIndiaScore match={match} className={className} />
  ) : (
    <UpcomingIndiaMatch match={match} className={className} />
  )
}
