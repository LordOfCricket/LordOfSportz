import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { fetchPublicTeams } from '../../services/publicTeamApi.js'
import { fetchTeamComparison } from '../../services/analyticsApi.js'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import BackButton from '../../components/common/BackButton.jsx'

function TeamPicker({ label, value, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!query.trim()) {
      const timer = window.setTimeout(() => setResults([]), 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      fetchPublicTeams({ search: query, limit: 8 })
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
          Change team
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
        placeholder="Search team by name..."
        className="mt-2 w-full rounded-lg border border-loc-border bg-loc-surface px-3 py-2 text-sm text-loc-navy placeholder:text-loc-faint focus:border-loc-green focus:outline-none"
      />
      {results.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {results.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onSelect(t)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-loc-muted hover:bg-loc-mint">
                {t.name}
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

export default function TeamComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [teamA, setTeamA] = useState(null)
  const [teamB, setTeamB] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Compare Teams — Lord Of Cricket'
  }, [])

  const t1 = searchParams.get('t1')
  const t2 = searchParams.get('t2')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!t1 || !t2) {
        setComparison(null)
        return
      }
      setLoading(true)
      setError(null)
      fetchTeamComparison(t1, t2)
        .then((data) => setComparison(data))
        .catch((err) => setError(err.response?.data?.message || "Couldn't compare these teams."))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [t1, t2])

  const selectA = (team) => {
    setTeamA(team)
    if (team) setSearchParams((prev) => ({ ...Object.fromEntries(prev), t1: String(team.id) }), { replace: true })
  }
  const selectB = (team) => {
    setTeamB(team)
    if (team) setSearchParams((prev) => ({ ...Object.fromEntries(prev), t2: String(team.id) }), { replace: true })
  }

  return (
    <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/teams" />

        <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold text-loc-navy">
          <Shield className="h-6 w-6 text-loc-green" />
          Compare Teams
        </h1>
        <p className="mt-1 text-sm text-loc-faint">Records and head-to-head history, side by side.</p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TeamPicker label="Team A" value={comparison?.teamA?.team || teamA} onSelect={selectA} />
          <TeamPicker label="Team B" value={comparison?.teamB?.team || teamB} onSelect={selectB} />
        </div>

        {loading && <div className="mt-6 h-32 w-full animate-pulse rounded-2xl bg-loc-surface" />}
        {error && (
          <div className="mt-6">
            <StatsErrorState light message={error} onRetry={() => setSearchParams((prev) => ({ ...Object.fromEntries(prev) }))} />
          </div>
        )}

        {comparison && !loading && !error && (
          <>
            <div className="mt-6 rounded-2xl border border-loc-border bg-loc-surface p-5">
              <div className="grid grid-cols-3 items-center gap-2 pb-3">
                <Link to={`/teams/${comparison.teamA.team.id}`} className="text-right text-sm font-bold text-loc-green hover:underline">
                  {comparison.teamA.team.name}
                </Link>
                <span />
                <Link to={`/teams/${comparison.teamB.team.id}`} className="text-left text-sm font-bold text-loc-green hover:underline">
                  {comparison.teamB.team.name}
                </Link>
              </div>
              {metricRow('Matches', comparison.teamA.record.matches, comparison.teamB.record.matches)}
              {metricRow('Wins', comparison.teamA.record.wins, comparison.teamB.record.wins)}
              {metricRow('Losses', comparison.teamA.record.losses, comparison.teamB.record.losses)}
              {metricRow('Win %', comparison.teamA.record.winPercentage, comparison.teamB.record.winPercentage, (v) => (v != null ? `${v.toFixed(1)}%` : '—'))}
              {metricRow('Avg Score', comparison.teamA.averageScore, comparison.teamB.averageScore, (v) => (v != null ? v.toFixed(1) : '—'))}
            </div>

            <div className="mt-4 rounded-2xl border border-loc-border bg-loc-surface p-5">
              <h3 className="text-sm font-bold text-loc-navy">Head-to-Head</h3>
              <p className="mt-2 text-sm text-loc-muted">
                {comparison.headToHead.matchesPlayed === 0
                  ? 'These teams have never played each other in a finalized match.'
                  : `${comparison.headToHead.matchesPlayed} meetings — ${comparison.teamA.team.name} ${comparison.headToHead.teamAWins}, ${comparison.teamB.team.name} ${comparison.headToHead.teamBWins}, ${comparison.headToHead.ties} tied, ${comparison.headToHead.noResults} no result.`}
              </p>
              {comparison.headToHead.recentMeetings.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 text-sm text-loc-muted">
                  {comparison.headToHead.recentMeetings.map((m) => (
                    <li key={m.matchId}>
                      <Link to={`/matches/${m.matchId}/summary`} className="hover:text-loc-green">
                        {new Date(m.date).toLocaleDateString()} —{' '}
                        {m.resultType === 'TIE' ? 'Tied' : m.resultType === 'NO_RESULT' ? 'No Result' : m.winnerTeamId === comparison.teamA.team.id ? `${comparison.teamA.team.name} won` : `${comparison.teamB.team.name} won`}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
