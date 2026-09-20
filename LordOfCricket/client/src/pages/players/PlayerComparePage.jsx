import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { searchPlayers } from '../../services/statisticsApi.js'
import { fetchPlayerComparison } from '../../services/analyticsApi.js'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import BackButton from '../../components/common/BackButton.jsx'

function PlayerPicker({ label, value, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!query.trim()) {
      const timer = window.setTimeout(() => setResults([]), 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      searchPlayers({ q: query, limit: 8 })
        .then((data) => setResults(data.items))
        .catch(() => setResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  if (value) {
    return (
      <div className="rounded-2xl border border-loc-border bg-loc-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">{label}</p>
        <p className="mt-1 text-lg font-bold text-loc-navy">{value.name}</p>
        <button type="button" onClick={() => onSelect(null)} className="mt-2 text-xs font-semibold text-loc-green hover:text-loc-green-strong">
          Change player
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-loc-border bg-loc-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-loc-faint">{label}</p>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search player by name..."
        className="mt-2 w-full rounded-lg border border-loc-border bg-loc-surface px-3 py-2 text-sm text-loc-navy placeholder:text-loc-faint focus:border-loc-green focus:outline-none"
      />
      {results.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.player.publicPlayerId}>
              <button
                type="button"
                onClick={() => onSelect(r.player)}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-loc-muted hover:bg-loc-mint"
              >
                {r.player.name} <span className="text-xs text-loc-faint">({r.player.publicPlayerId})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function metricRow(label, a, b, formatter = (v) => v ?? '—') {
  return (
    <div className="grid grid-cols-3 items-center gap-2 border-b border-loc-border/60 py-2 text-sm last:border-0">
      <span className="text-right font-semibold text-loc-navy">{formatter(a)}</span>
      <span className="text-center text-xs uppercase tracking-wide text-loc-faint">{label}</span>
      <span className="text-left font-semibold text-loc-navy">{formatter(b)}</span>
    </div>
  )
}

export default function PlayerComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [playerA, setPlayerA] = useState(null)
  const [playerB, setPlayerB] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Compare Players — Lord Of Cricket'
  }, [])

  const p1 = searchParams.get('p1')
  const p2 = searchParams.get('p2')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!p1 || !p2) {
        setComparison(null)
        return
      }
      setLoading(true)
      setError(null)
      fetchPlayerComparison(p1, p2)
        .then((data) => setComparison(data))
        .catch((err) => setError(err.response?.data?.message || "Couldn't compare these players."))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [p1, p2])

  const selectA = (player) => {
    setPlayerA(player)
    if (player) setSearchParams((prev) => ({ ...Object.fromEntries(prev), p1: player.publicPlayerId }), { replace: true })
  }
  const selectB = (player) => {
    setPlayerB(player)
    if (player) setSearchParams((prev) => ({ ...Object.fromEntries(prev), p2: player.publicPlayerId }), { replace: true })
  }

  const career = (side) => comparison?.[side]?.career

  return (
    <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/players" />

        <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold text-loc-navy">
          <Users className="h-6 w-6 text-loc-green" />
          Compare Players
        </h1>
        <p className="mt-1 text-sm text-loc-faint">Official career statistics, side by side. No overall winner is calculated — the facts speak for themselves.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerPicker label="Player A" value={comparison?.playerA?.player || playerA} onSelect={selectA} />
          <PlayerPicker label="Player B" value={comparison?.playerB?.player || playerB} onSelect={selectB} />
        </div>

        {loading && <div className="mt-6 h-32 w-full animate-pulse rounded-2xl bg-loc-surface" />}
        {error && (
          <div className="mt-6">
            <StatsErrorState light message={error} onRetry={() => setSearchParams((prev) => ({ ...Object.fromEntries(prev) }))} />
          </div>
        )}

        {comparison && !loading && !error && (
          <div className="mt-6 rounded-2xl border border-loc-border bg-loc-surface p-5">
            <div className="grid grid-cols-3 items-center gap-2 pb-3">
              <Link to={`/players/${comparison.playerA.player.publicPlayerId}`} className="text-right text-sm font-bold text-loc-green hover:underline">
                {comparison.playerA.player.name}
              </Link>
              <span />
              <Link to={`/players/${comparison.playerB.player.publicPlayerId}`} className="text-left text-sm font-bold text-loc-green hover:underline">
                {comparison.playerB.player.name}
              </Link>
            </div>
            {metricRow('Matches', career('playerA')?.matches, career('playerB')?.matches)}
            {metricRow('Runs', career('playerA')?.batting.runs, career('playerB')?.batting.runs)}
            {metricRow('Batting Avg', career('playerA')?.batting.average, career('playerB')?.batting.average, (v) => (v != null ? v.toFixed(2) : '—'))}
            {metricRow('Strike Rate', career('playerA')?.batting.strikeRate, career('playerB')?.batting.strikeRate, (v) => (v != null ? v.toFixed(2) : '—'))}
            {metricRow('Highest Score', career('playerA')?.batting.highestScore ? `${career('playerA').batting.highestScore.runs}${career('playerA').batting.highestScore.notOut ? '*' : ''}` : '—', career('playerB')?.batting.highestScore ? `${career('playerB').batting.highestScore.runs}${career('playerB').batting.highestScore.notOut ? '*' : ''}` : '—')}
            {metricRow('Fours', career('playerA')?.batting.fours, career('playerB')?.batting.fours)}
            {metricRow('Sixes', career('playerA')?.batting.sixes, career('playerB')?.batting.sixes)}
            {metricRow('Wickets', career('playerA')?.bowling.wickets, career('playerB')?.bowling.wickets)}
            {metricRow('Bowling Avg', career('playerA')?.bowling.average, career('playerB')?.bowling.average, (v) => (v != null ? v.toFixed(2) : '—'))}
            {metricRow('Economy', career('playerA')?.bowling.economy, career('playerB')?.bowling.economy, (v) => (v != null ? v.toFixed(2) : '—'))}
            {metricRow(
              'Best Bowling',
              career('playerA')?.bowling.bestBowling ? `${career('playerA').bowling.bestBowling.wickets}/${career('playerA').bowling.bestBowling.runs}` : '—',
              career('playerB')?.bowling.bestBowling ? `${career('playerB').bowling.bestBowling.wickets}/${career('playerB').bowling.bestBowling.runs}` : '—'
            )}
          </div>
        )}
      </div>
    </main>
  )
}
