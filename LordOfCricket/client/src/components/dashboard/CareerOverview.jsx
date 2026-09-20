import { useCareerStats } from '../../hooks/useCareerStats.js'
import { StatsLoadingGrid, StatsErrorState, StatsEmptyState } from '../stats/StatsStates.jsx'
import StatTile from '../stats/StatTile.jsx'

// Official career statistics — derived server-side from finalized PostgreSQL
// match history on every load, never from local counters. Keep this card
// concise (5 headline numbers); the full breakdown lives on the Profile page.
export default function CareerOverview() {
  const { stats, loading, error, noPlayerProfile, retry } = useCareerStats()

  return (
    <div id="career" className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm scroll-mt-24">
      <h2 className="text-xl font-semibold text-white">Career Overview</h2>

      <div className="mt-4">
        {loading && <StatsLoadingGrid tiles={5} />}
        {!loading && noPlayerProfile && <StatsEmptyState label="Your cricket statistics" />}
        {!loading && !noPlayerProfile && error && <StatsErrorState message={error} onRetry={retry} />}
        {!loading && !noPlayerProfile && !error && stats && stats.career.matches === 0 && <StatsEmptyState label="Your cricket statistics" />}
        {!loading && !noPlayerProfile && !error && stats && stats.career.matches > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Matches" value={stats.career.matches} emphasis />
            <StatTile label="Runs" value={stats.career.batting.runs} />
            <StatTile label="Wickets" value={stats.career.bowling.wickets} />
            <StatTile label="Average" value={stats.career.batting.average} />
            <StatTile label="Strike Rate" value={stats.career.batting.strikeRate} />
          </div>
        )}
      </div>
    </div>
  )
}
