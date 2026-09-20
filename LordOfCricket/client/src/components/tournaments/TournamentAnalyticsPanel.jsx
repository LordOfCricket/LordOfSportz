import { Link } from 'react-router-dom'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { fetchTournamentAnalytics } from '../../services/analyticsApi.js'
import StatTile from '../analytics/StatTile.jsx'

function num(v, digits = 1) {
  return v == null ? '—' : v.toFixed(digits)
}

// Best single innings / best bowling figures among the tournament's leading
// players — real values the analytics payload already carries on every
// topRunScorers[].highestScore / topWicketTakers[].bestBowling (rendered
// nowhere until now). Sorting mirrors leaderboardConfig.js: highest score by
// runs desc; best bowling by wickets desc then runs asc.
function bestInningsOf(topRunScorers) {
  return (topRunScorers || []).reduce((best, p) => {
    if (!p.highestScore) return best
    if (!best || p.highestScore.runs > best.highestScore.runs) return p
    return best
  }, null)
}
function bestFiguresOf(topWicketTakers) {
  return (topWicketTakers || []).reduce((best, p) => {
    if (!p.bestBowling) return best
    if (!best) return p
    const a = p.bestBowling
    const b = best.bestBowling
    if (a.wickets > b.wickets || (a.wickets === b.wickets && a.runs < b.runs)) return p
    return best
  }, null)
}

export default function TournamentAnalyticsPanel({ publicTournamentId }) {
  const { data, loading, error } = useAnalytics(fetchTournamentAnalytics, publicTournamentId)

  if (loading) {
    return <div className="h-16 w-full animate-pulse rounded-2xl bg-loc-mint" />
  }
  if (error || !data) return null

  const bestInnings = bestInningsOf(data.topRunScorers)
  const bestFigures = bestFiguresOf(data.topWicketTakers)
  const hasRecords = data.highestTeamTotal != null || bestInnings || bestFigures

  return (
    <div className="space-y-4">
      <div className="rounded-2xl loc-card p-4">
        <h3 className="text-sm font-bold text-loc-navy">Tournament Analytics</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile light label="Finalized Matches" value={`${data.finalizedMatches}/${data.totalFixtures}`} />
          <StatTile light label="Total Runs" value={data.totalRuns} />
          <StatTile light label="Total Wickets" value={data.totalWickets} />
          <StatTile light label="Avg 1st Innings Score" value={num(data.averageFirstInningsScore)} />
          <StatTile light label="Highest Team Total" value={data.highestTeamTotal} />
          <StatTile light label="Lowest Team Total" value={data.lowestTeamTotal} />
        </div>
      </div>

      {hasRecords && (
        <div className="rounded-2xl loc-card p-4">
          <h3 className="text-sm font-bold text-loc-navy">Tournament Records</h3>
          <p className="mt-0.5 text-xs text-loc-faint">From this tournament&apos;s finalized matches and leading players.</p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-loc-mint px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-loc-faint">Highest Team Total</dt>
              <dd className="mt-0.5 text-sm font-bold text-loc-navy">{data.highestTeamTotal == null ? '—' : data.highestTeamTotal}</dd>
            </div>
            <div className="rounded-xl bg-loc-mint px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-loc-faint">Highest Score</dt>
              <dd className="mt-0.5 text-sm font-bold text-loc-navy">
                {bestInnings ? (
                  <>
                    {bestInnings.highestScore.runs}
                    {bestInnings.highestScore.notOut ? '*' : ''}{' '}
                    <Link
                      to={`/players/${bestInnings.player.publicPlayerId}`}
                      className="font-medium text-loc-green hover:text-loc-green-strong"
                    >
                      {bestInnings.player.name}
                    </Link>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-loc-mint px-3 py-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-loc-faint">Best Bowling</dt>
              <dd className="mt-0.5 text-sm font-bold text-loc-navy">
                {bestFigures ? (
                  <>
                    {bestFigures.bestBowling.wickets}/{bestFigures.bestBowling.runs}{' '}
                    <Link
                      to={`/players/${bestFigures.player.publicPlayerId}`}
                      className="font-medium text-loc-green hover:text-loc-green-strong"
                    >
                      {bestFigures.player.name}
                    </Link>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
