import { useHomeDiscovery } from '../../hooks/useHomeDiscovery.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'

function ResultCard({ match }) {
  const homeScore = match.homeTeam?.runsScored || 0
  const awayScore = match.awayTeam?.runsScored || 0
  const isWin = homeScore > awayScore
  const matchDate = new Date(match.createdAt || new Date())
  const dateStr = matchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <ScrollReveal variant={fadeUpSoft} amount={0.3} className="loc-card loc-card-hover p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Teams & Score */}
        <div className="flex flex-col items-center justify-center gap-3 lg:col-span-1">
          <div className={`flex items-center justify-center w-full gap-4 ${isWin ? 'bg-loc-mint rounded-lg p-3' : 'p-3'}`}>
            <p className="text-sm font-semibold text-loc-navy flex-1 text-right">{match.homeTeam?.name || 'Team A'}</p>
            <p className={`text-lg font-bold ${isWin ? 'text-loc-green' : 'text-loc-navy'} min-w-12 text-center`}>{homeScore}</p>
          </div>
          <p className="text-xs text-loc-muted">vs</p>
          <div className="flex items-center justify-center w-full gap-4 p-3">
            <p className="text-sm font-semibold text-loc-navy flex-1">{match.awayTeam?.name || 'Team B'}</p>
            <p className="text-lg font-bold text-loc-navy min-w-12 text-center">{awayScore}</p>
          </div>
        </div>

        {/* Match Details */}
        <div className="flex flex-col justify-center gap-2 text-center lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-loc-green">{match.format || 'T20'}</p>
          <p className="text-sm text-loc-muted">{dateStr}</p>
          <p className="text-xs text-loc-faint">{match.status || 'Completed'}</p>
        </div>

        {/* Winner/Venue */}
        <div className="flex flex-col justify-center gap-2 text-center lg:text-right lg:col-span-1">
          <p className="text-xs uppercase tracking-widest text-loc-green">Winner</p>
          <p className="text-sm text-loc-muted">{isWin ? match.homeTeam?.name || 'Team A' : match.awayTeam?.name || 'Team B'}</p>
          <p className="text-xs text-loc-faint">{match.ground?.name || 'TBD'}</p>
        </div>
      </div>
    </ScrollReveal>
  )
}

export default function RecentResults() {
  const { matches, loading, error } = useHomeDiscovery()

  const recentMatches = !matches
    ? []
    : matches
        .filter((m) => m.status === 'completed' || m.status === 'finished')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-loc-border border-t-loc-green" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Unable to load results</p>
      </div>
    )
  }

  if (recentMatches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-loc-border bg-loc-mint p-12 text-center">
        <p className="text-loc-muted">No recent results available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {recentMatches.map((match) => (
          <ResultCard key={match.id} match={match} />
        ))}
      </div>
    </div>
  )
}
