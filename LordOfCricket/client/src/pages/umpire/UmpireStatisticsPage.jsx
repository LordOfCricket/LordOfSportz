import { Star } from 'lucide-react'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import StatTile from '../../components/stats/StatTile.jsx'
import ReputationBadges from '../../components/common/ReputationBadges.jsx'
import LineChart from '../../components/analytics/LineChart.jsx'
import { useUmpireStatistics } from '../../hooks/useUmpireStatistics.js'

// Umpire Intelligence & Scale 2.0, Workstreams G/H — reuses the existing,
// dependency-free LineChart rather than adding a chart library.
// A month with no real terminal history reports null upstream (never a
// fabricated 0) — filtered out of a metric's own series here, so the line
// only ever connects genuinely-known points, and "Not enough data yet"
// covers the case where nothing at all is known yet.
function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: 'short' })
}

function buildSeries(trendMonths, field, color, label) {
  const points = trendMonths.map((m, i) => ({ x: i, y: m[field] })).filter((p) => p.y != null)
  return { label, color, points }
}

export default function UmpireStatisticsPage() {
  const {
    loading,
    error,
    matchesOfficiated,
    upcomingAssignments,
    noShows,
    cancellations,
    reliability,
    ratingAvg,
    ratingCount,
    matchesThisMonth,
    groundsOfficiatedAt,
    lastMonth,
    last3Months,
    verified,
    badges,
    trendMonths,
    refresh,
  } = useUmpireStatistics()

  const hasTrendData = trendMonths?.some((m) => m.matchesOfficiated > 0 || m.reliability != null || m.ratingAvg != null)
  const xTickLabel = (i) => (trendMonths?.[i] ? monthLabel(trendMonths[i].month) : '')

  return (
    <UmpireLayout title="My Statistics" subtitle="Your umpiring activity at a glance.">
      {loading && <StatsLoadingGrid tiles={4} />}
      {!loading && error && <StatsErrorState message={error} onRetry={refresh} />}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Matches Officiated" value={matchesOfficiated} emphasis />
            <StatTile label="Upcoming Assignments" value={upcomingAssignments} />
            <StatTile label="Matches This Month" value={matchesThisMonth} />
            <StatTile label="Grounds Officiated At" value={groundsOfficiatedAt} />
            <StatTile label="Reliability" value={reliability != null ? `${reliability}%` : 'N/A'} emphasis />
            <StatTile label="No Shows" value={noShows} />
            <StatTile label="Cancellations" value={cancellations} />
          </div>

          {(verified || badges.length > 0) && (
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="text-xl font-semibold text-white">Reputation</h2>
              <div className="mt-3">
                <ReputationBadges verified={verified} badges={badges} />
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Activity</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <StatTile label="This Month" value={matchesThisMonth} />
              <StatTile label="Last Month" value={lastMonth} />
              <StatTile label="Last 3 Months" value={last3Months} />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Matches by Month</h2>
            {hasTrendData ? (
              <div className="mt-4">
                <LineChart
                  series={[buildSeries(trendMonths, 'matchesOfficiated', '#34d399', 'Matches Officiated')]}
                  xTickLabel={xTickLabel}
                  formatY={(v) => v}
                  emptyLabel="Not enough data yet."
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Reliability Trend</h2>
            {trendMonths?.some((m) => m.reliability != null) ? (
              <div className="mt-4">
                <LineChart
                  series={[buildSeries(trendMonths, 'reliability', '#38bdf8', 'Reliability')]}
                  xTickLabel={xTickLabel}
                  formatY={(v) => `${v}%`}
                  emptyLabel="Not enough data yet."
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Rating Trend</h2>
            {trendMonths?.some((m) => m.ratingAvg != null) ? (
              <div className="mt-4">
                <LineChart
                  series={[buildSeries(trendMonths, 'ratingAvg', '#fbbf24', 'Rating')]}
                  xTickLabel={xTickLabel}
                  formatY={(v) => Number(v).toFixed(1)}
                  emptyLabel="Not enough data yet."
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not enough data yet.</p>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white">Rating</h2>
            {ratingCount > 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-2xl font-bold text-amber-300">
                  <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                  {Number(ratingAvg).toFixed(2)}
                </span>
                <span className="text-sm text-slate-400">
                  from {ratingCount} review{ratingCount === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Not available yet — no umpire feedback has been submitted for you.</p>
            )}
          </div>
        </div>
      )}
    </UmpireLayout>
  )
}
