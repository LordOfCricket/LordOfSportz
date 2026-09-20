import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Swords } from 'lucide-react'
import { searchPlayers } from '../../services/statisticsApi.js'
import { fetchPlayerHeadToHead } from '../../services/analyticsApi.js'
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

const n0 = (v) => (v == null ? '—' : String(v))
const n2 = (v) => (v == null ? '—' : v.toFixed(2))

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-loc-surface px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-loc-faint">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-loc-navy">{value}</p>
    </div>
  )
}

function EncounterCard({ attacker, defender, batting, bowling }) {
  return (
    <div className="rounded-2xl border border-loc-border bg-loc-surface p-5">
      <p className="text-sm font-bold text-loc-navy">
        <span className="text-loc-green">{attacker}</span> vs {defender}
      </p>

      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-loc-faint">
        {attacker} batting against {defender}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <Stat label="Runs" value={n0(batting.runs)} />
        <Stat label="Balls" value={n0(batting.ballsFaced)} />
        <Stat label="Strike Rate" value={n2(batting.strikeRate)} />
        <Stat label="Dismissals" value={n0(batting.dismissals)} />
        <Stat label="Average" value={n2(batting.average)} />
        <Stat label="Fours" value={n0(batting.fours)} />
        <Stat label="Sixes" value={n0(batting.sixes)} />
        <Stat label="Dot Balls" value={n0(batting.dots)} />
      </div>

      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-loc-faint">
        {attacker} bowling to {defender}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <Stat label="Wickets" value={n0(bowling.wickets)} />
        <Stat label="Runs" value={n0(bowling.runsConceded)} />
        <Stat label="Balls" value={n0(bowling.legalBalls)} />
        <Stat label="Economy" value={n2(bowling.economy)} />
        <Stat label="Average" value={n2(bowling.average)} />
        <Stat label="Strike Rate" value={n2(bowling.strikeRate)} />
        <Stat label="Dot Balls" value={n0(bowling.dots)} />
      </div>
    </div>
  )
}

export default function PlayerHeadToHeadPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [playerA, setPlayerA] = useState(null)
  const [playerB, setPlayerB] = useState(null)
  const [h2h, setH2h] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    document.title = 'Head-to-Head — Lord Of Cricket'
  }, [])

  const p1 = searchParams.get('p1')
  const p2 = searchParams.get('p2')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!p1 || !p2) {
        setH2h(null)
        return
      }
      setLoading(true)
      setError(null)
      fetchPlayerHeadToHead(p1, p2)
        .then((data) => setH2h(data))
        .catch((err) => setError(err.response?.data?.message || "Couldn't load the head-to-head."))
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

  return (
    <main className="loc-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <BackButton fallback="/players" />

        <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold text-loc-navy">
          <Swords className="h-6 w-6 text-loc-green" />
          Head-to-Head
        </h1>
        <p className="mt-1 text-sm text-loc-faint">
          Real batter-vs-bowler encounters in the finalized matches where both players appeared. This is not a career comparison.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PlayerPicker label="Player A" value={h2h?.playerA || playerA} onSelect={selectA} />
          <PlayerPicker label="Player B" value={h2h?.playerB || playerB} onSelect={selectB} />
        </div>

        {loading && <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-loc-surface" />}
        {error && (
          <div className="mt-6">
            <StatsErrorState light message={error} onRetry={() => setSearchParams((prev) => ({ ...Object.fromEntries(prev) }))} />
          </div>
        )}

        {h2h && !loading && !error && (
          <div className="mt-6 space-y-4">
            {h2h.matchesPlayed === 0 ? (
              <div className="rounded-2xl border border-dashed border-loc-border bg-loc-surface px-6 py-10 text-center text-sm text-loc-muted">
                {h2h.playerA.name} and {h2h.playerB.name} have never appeared in the same finalized LOC match.
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-loc-muted">
                  {h2h.matchesPlayed} shared {h2h.matchesPlayed === 1 ? 'match' : 'matches'}
                </p>

                <EncounterCard
                  attacker={h2h.playerA.name}
                  defender={h2h.playerB.name}
                  batting={h2h.aVsB.batting}
                  bowling={h2h.aVsB.bowling}
                />
                <EncounterCard
                  attacker={h2h.playerB.name}
                  defender={h2h.playerA.name}
                  batting={h2h.bVsA.batting}
                  bowling={h2h.bVsA.bowling}
                />

                <div className="rounded-2xl border border-loc-border bg-loc-surface p-5">
                  <h3 className="text-sm font-bold text-loc-navy">Meetings</h3>
                  <ul className="mt-3 space-y-1.5 text-sm text-loc-muted">
                    {h2h.meetings.map((m) => (
                      <li key={m.matchId}>
                        <Link to={`/matches/${m.matchId}/summary`} className="hover:text-loc-green">
                          {new Date(m.date).toLocaleDateString()} — {m.playerATeam || m.teamAName} vs {m.playerBTeam || m.teamBName}
                          {m.resultText ? <span className="text-loc-faint"> · {m.resultText}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
