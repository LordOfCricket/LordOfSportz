import { useState } from 'react'
import { Search, UserPlus, UserMinus } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import { roleLabel } from '../../models/player.model.js'
import { searchPlayers } from '../../services/statisticsApi.js'
import { addPlayerToTeam, removePlayerFromTeam } from '../../services/publicTeamApi.js'

// Staff-only roster management. Team membership (players.team_id)
// previously had no HTTP-reachable write path at all; this is the smallest
// robust UI for it: search the existing public player directory, add/remove
// by publicPlayerId, and let the caller (TeamProfilePage) refetch the public
// profile afterward so squad/record stay the single source of truth.
export default function TeamSquadManager({ team, squad, onChange, light = false }) {
  const row = light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'
  const strong = light ? 'text-loc-navy' : 'text-white'
  const dim = light ? 'text-loc-faint' : 'text-slate-400'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const runSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      const { items } = await searchPlayers({ q: query.trim(), limit: 10 })
      setResults(items)
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (publicPlayerId) => {
    setBusyId(publicPlayerId)
    setError('')
    try {
      await addPlayerToTeam(team.id, publicPlayerId)
      setResults((prev) => prev.filter((item) => item.player.publicPlayerId !== publicPlayerId))
      await onChange()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to add this player.')
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (publicPlayerId) => {
    setBusyId(publicPlayerId)
    setError('')
    try {
      await removePlayerFromTeam(team.id, publicPlayerId)
      await onChange()
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to remove this player.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`rounded-2xl border p-5 ${light ? "border-amber-200 bg-amber-50" : "border-amber-400/20 bg-amber-500/5"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${light ? "text-amber-800" : "text-amber-200"}`}>Staff — Manage Squad</p>

      <form onSubmit={runSearch} className="mt-3 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players by name…"
          className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${light ? "border-loc-border bg-loc-surface text-loc-navy placeholder:text-loc-faint" : "border-white/15 bg-white/5 text-white placeholder:text-slate-500"}`}
        />
        <button
          type="submit"
          disabled={searching}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${light ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"}`}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </form>

      {error && <p className={`mt-3 text-sm ${light ? "text-rose-600" : "text-rose-300"}`}>{error}</p>}

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map(({ player }) => {
            const alreadyHere = player.team?.id === team.id
            return (
              <div key={player.publicPlayerId} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${row}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${strong}`}>{player.name}</p>
                    <p className={`truncate text-xs ${dim}`}>
                      {roleLabel(player.role) || 'Role not set'}
                      {player.team ? ` · Currently: ${player.team.name}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={alreadyHere || busyId === player.publicPlayerId}
                  onClick={() => handleAdd(player.publicPlayerId)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${light ? "border-loc-green/30 bg-loc-mint text-loc-green hover:bg-loc-surface" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"}`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {alreadyHere ? 'On this team' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {squad.length > 0 && (
        <div className={`mt-6 border-t pt-4 ${light ? "border-loc-border" : "border-white/10"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${dim}`}>Current Squad</p>
          <div className="mt-3 space-y-2">
            {squad.map((player) => (
              <div key={player.publicPlayerId} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${row}`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={player.name} photoUrl={player.photoUrl} size="sm" />
                  <p className={`truncate text-sm font-semibold ${strong}`}>{player.name}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === player.publicPlayerId}
                  onClick={() => handleRemove(player.publicPlayerId)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${light ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : "border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"}`}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
