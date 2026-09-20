import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, Users, Swords } from 'lucide-react'
import { searchPlayers } from '../../services/statisticsApi.js'
import { fetchTeams } from '../../services/playerApi.js'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'
import { PLAYING_ROLE_LABELS } from '../../models/player.model.js'
import PlayerCard from '../../components/players/PlayerCard.jsx'
import { StatsLoadingGrid, StatsErrorState } from '../../components/stats/StatsStates.jsx'
import Navbar from '../../components/home/Navbar.jsx'
import ScrollReveal from '../../components/common/ScrollReveal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'

const ROLE_OPTIONS = [{ value: '', label: 'All Roles' }, ...Object.entries(PLAYING_ROLE_LABELS).map(([value, label]) => ({ value, label }))]
const PAGE_SIZE = 12

function LeftSidebar({ role, onRoleChange, teamId, onTeamChange, teams }) {
  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="sticky top-32 space-y-6">
        {/* Role Filter */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase text-loc-green">Playing Role</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onRoleChange(opt.value)}
                className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  role === opt.value
                    ? 'bg-loc-mint text-loc-navy font-semibold'
                    : 'text-loc-muted hover:bg-loc-mint'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Team Filter */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase text-loc-green">Team</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            <button
              onClick={() => onTeamChange('')}
              className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                teamId === ''
                  ? 'bg-loc-mint text-loc-navy font-semibold'
                  : 'text-loc-muted hover:bg-loc-mint'
              }`}
            >
              All Teams
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => onTeamChange(t.id)}
                className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  teamId === t.id
                    ? 'bg-loc-mint text-loc-navy font-semibold'
                    : 'text-loc-muted hover:bg-loc-mint'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

export default function PlayersDiscoveryPage() {
  useEffect(() => {
    document.title = 'Players — Lord Of Cricket'
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [role, setRole] = useState(searchParams.get('role') || '')
  const [teamId, setTeamId] = useState(searchParams.get('team') || '')
  const [teams, setTeams] = useState([])
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const debouncedQuery = useDebouncedValue(query, 350)

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => setTeams([]))
  }, [])

  const load = useCallback(() => {
    const request = searchPlayers({ q: debouncedQuery || undefined, role: role || undefined, teamId: teamId || undefined, limit: PAGE_SIZE, offset })
    return request
      .then((data) => {
        setResult(data)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load players."))
      .finally(() => setLoading(false))
  }, [debouncedQuery, role, teamId, offset])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const next = {}
    if (debouncedQuery) next.q = debouncedQuery
    if (role) next.role = role
    if (teamId) next.team = teamId
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, role, teamId])

  const changeQuery = (value) => {
    setLoading(true)
    setOffset(0)
    setQuery(value)
  }
  const changeRole = (value) => {
    setLoading(true)
    setOffset(0)
    setRole(value)
  }
  const changeTeam = (value) => {
    setLoading(true)
    setOffset(0)
    setTeamId(value)
  }
  const changePage = (nextOffset) => {
    setLoading(true)
    setOffset(nextOffset)
  }

  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto w-full max-w-7xl px-6 pt-32 pb-20 lg:px-10">
        {/* Page Title */}
        <ScrollReveal variant={fadeUpSoft} amount={0.4} className="mb-10 flex w-full flex-col items-center gap-3 text-center">
          <h1 className="loc-heading text-3xl sm:text-4xl">
            Discover Players
          </h1>
          <p className="max-w-2xl text-loc-muted">Explore talented cricket players across Lord Of Cricket.</p>
        </ScrollReveal>

        {/* Search Bar */}
        <div className="mb-8 flex justify-center">
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-loc-green" />
            <input
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="Search players by name or ID..."
              className="w-full rounded-2xl border border-loc-border bg-loc-surface py-3 pl-12 pr-4 text-sm text-loc-navy placeholder:text-loc-faint focus:border-loc-border focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Compare Players / Head-to-Head Links */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          <Link
            to="/players/compare"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-loc-green px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition-all duration-200 hover:bg-loc-green-strong"
          >
            <Users className="h-4 w-4" />
            Compare Players
          </Link>
          <Link
            to="/players/head-to-head"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-loc-green px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition-all duration-200 hover:bg-loc-green-strong"
          >
            <Swords className="h-4 w-4" />
            Head-to-Head
          </Link>
        </div>

        {/* Main Layout: Sidebar + Grid */}
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left Sidebar with Filters */}
          <LeftSidebar role={role} onRoleChange={changeRole} teamId={teamId} onTeamChange={changeTeam} teams={teams} />

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex w-full flex-col gap-6">
              {/* Results Header */}
              {result && result.items.length > 0 && (
                <p className="text-sm font-semibold uppercase tracking-widest text-loc-faint">
                  {result.items.length} {result.items.length === 1 ? 'Player' : 'Players'}
                </p>
              )}

              {/* Players Grid */}
              {loading && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <StatsLoadingGrid tiles={6} light />
                </div>
              )}
              {!loading && error && <StatsErrorState message={error} onRetry={load} light />}
              {!loading && !error && result && result.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-loc-border bg-loc-surface px-6 py-16 text-center text-sm text-loc-muted">
                  No players match your search.
                </div>
              )}
              {!loading && !error && result && result.items.length > 0 && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {result.items.map((item) => (
                      <PlayerCard key={item.player.publicPlayerId} player={item.player} career={item.career} light />
                    ))}
                  </div>

                  {result.pagination.total > PAGE_SIZE && (
                    <div className="mt-8 flex items-center justify-between gap-4 rounded-full border border-loc-border bg-loc-surface px-6 py-4">
                      <button
                        type="button"
                        disabled={offset === 0}
                        onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
                        className="rounded-full border border-loc-border px-4 py-2 text-sm font-semibold text-loc-navy transition-colors hover:bg-loc-mint disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-loc-muted">
                        {offset + 1}–{Math.min(offset + PAGE_SIZE, result.pagination.total)} of {result.pagination.total}
                      </span>
                      <button
                        type="button"
                        disabled={offset + PAGE_SIZE >= result.pagination.total}
                        onClick={() => changePage(offset + PAGE_SIZE)}
                        className="rounded-full border border-loc-border px-4 py-2 text-sm font-semibold text-loc-navy transition-colors hover:bg-loc-mint disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
