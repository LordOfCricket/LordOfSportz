import { Link } from 'react-router-dom'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { fetchTeamAnalytics } from '../../services/analyticsApi.js'
import LineChart from './LineChart.jsx'
import StatTile from './StatTile.jsx'

function pct(v) {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function num(v, digits = 1) {
  return v == null ? '—' : v.toFixed(digits)
}

export default function TeamAnalyticsSection({ teamId, light = false }) {
  const card = light ? 'border-loc-border bg-loc-surface' : 'border-white/10 bg-white/5'
  const heading = light ? 'text-loc-navy' : 'text-white'
  const muted = light ? 'text-loc-faint' : 'text-slate-400'
  const { data, loading, error } = useAnalytics(fetchTeamAnalytics, teamId)

  if (loading) {
    return (
      <div className={`rounded-2xl border p-5 ${card}`}>
        <div className={`h-4 w-1/3 animate-pulse rounded ${light ? "bg-loc-border-soft" : "bg-white/10"}`} />
        <div className={`mt-4 h-24 w-full animate-pulse rounded ${light ? "bg-loc-mint" : "bg-white/5"}`} />
      </div>
    )
  }
  if (error || !data) return null

  if (data.recentForm.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Analytics</h3>
        <p className={`mt-2 text-sm ${muted}`}>Not enough finalized matches yet for analytics.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Scoring Averages</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile light={light} label="Avg Score" value={num(data.averageScore, 1)} />
          <StatTile light={light} label="Avg Conceded" value={num(data.averageConceded, 1)} />
          <StatTile light={light} label="Batting First Win %" value={pct(data.battingFirstVsChasing.battingFirst.winPercentage)} />
          <StatTile light={light} label="Chasing Win %" value={pct(data.battingFirstVsChasing.chasing.winPercentage)} />
        </div>
        <p className={`mt-3 text-xs ${muted}`}>
          Batting first: {data.battingFirstVsChasing.battingFirst.wins}/{data.battingFirstVsChasing.battingFirst.matches} won · Chasing:{' '}
          {data.battingFirstVsChasing.chasing.wins}/{data.battingFirstVsChasing.chasing.matches} won
        </p>
      </div>

      {data.runRateTrend.length > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-sm font-bold ${heading}`}>Run-Rate Trend — Last {data.runRateTrend.length} Matches</h3>
          <div className="mt-4">
            <LineChart
              series={[{ label: 'Run Rate', color: '#34d399', points: data.runRateTrend.map((m, i) => ({ x: i + 1, y: m.runRate })) }]}
              xTickLabel={(x) => data.runRateTrend[x - 1]?.opponent || `Match ${x}`}
              formatY={(v) => v.toFixed(2)}
            />
          </div>
        </div>
      )}

      {data.tournamentPerformance.length > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-sm font-bold ${heading}`}>Tournament Performance</h3>
          <div className="mt-3 flex flex-col gap-2">
            {data.tournamentPerformance.map((t) => (
              <Link
                key={t.tournamentId}
                to={`/tournaments/${t.publicTournamentId}`}
                className={`flex items-center justify-between rounded-xl border p-3 transition-colors ${light ? "border-loc-border bg-loc-mint hover:bg-loc-surface" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
              >
                <span className={`text-sm font-semibold ${heading}`}>
                  {t.name} {t.isChampion && <span className="ml-1 text-amber-300">🏆</span>}
                </span>
                <span className={`text-xs ${muted}`}>
                  {t.played != null ? `${t.won}W-${t.lost}L-${t.tied ?? 0}T · ${t.points ?? 0} pts` : t.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
