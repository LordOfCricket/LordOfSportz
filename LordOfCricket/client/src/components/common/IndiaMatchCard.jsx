import { useEffect, useState } from 'react'
import { getFeaturedIndiaMatch } from '../../services/indiaMatch.js'
import TeamScore from './TeamScore.jsx'

export default function IndiaMatchCard() {
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    getFeaturedIndiaMatch()
      .then((data) => setMatch(data))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-emerald-400/15 bg-emerald-900/30 text-emerald-100/60">
        Loading India match…
      </div>
    )
  }

  if (errored || !match) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-emerald-400/20 bg-emerald-900/20 px-6 text-center text-emerald-100/60">
        No India international match info available right now
      </div>
    )
  }

  const matchDate = new Date(match.dateTimeGMT).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="flex h-full flex-col gap-6 rounded-3xl border border-emerald-400/15 bg-linear-to-b from-emerald-900/60 to-emerald-950/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-emerald-100/50">
          {matchDate}
          {match.matchType ? ` · ${match.matchType.toUpperCase()}` : ''}
        </span>
        {match.isLive ? (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            LIVE
          </span>
        ) : (
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            NEXT MATCH
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <TeamScore
          name={match.teamA.name}
          shortName={match.teamA.shortName}
          logoUrl={match.teamA.logoUrl}
          runs={match.isLive ? match.teamA.runs : null}
          wickets={match.teamA.wickets}
          overs={match.teamA.overs}
        />
        <span className="text-sm font-semibold text-emerald-100/40">VS</span>
        <TeamScore
          name={match.teamB.name}
          shortName={match.teamB.shortName}
          logoUrl={match.teamB.logoUrl}
          runs={match.isLive ? match.teamB.runs : null}
          wickets={match.teamB.wickets}
          overs={match.teamB.overs}
        />
      </div>

      <p className="text-center text-xs text-emerald-100/50">{match.venue}</p>
    </div>
  )
}
