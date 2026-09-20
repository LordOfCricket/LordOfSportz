import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users2, MapPin } from 'lucide-react'
import { fetchFollowing } from '../../services/followApi.js'
import Avatar from '../ui/Avatar.jsx'
import { roleLabel } from '../../models/player.model.js'
import { StatsErrorState } from '../stats/StatsStates.jsx'

// The authenticated user's "Following" quick-access list — players and teams
// they follow, each linking to its existing public profile. Everything is a
// real public-safe reference from GET /me/following.
export default function FollowingList() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchFollowing()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load your Following list."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading) {
    return <div className="h-24 w-full animate-pulse rounded-2xl bg-white/5" />
  }
  if (error) {
    return <StatsErrorState message={error} onRetry={load} />
  }

  const players = data?.players?.items ?? []
  const teams = data?.teams?.items ?? []
  const grounds = data?.grounds?.items ?? []

  if (players.length === 0 && teams.length === 0 && grounds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
        <Users2 className="h-8 w-8 text-slate-500" />
        <p className="text-sm text-slate-300">You're not following anyone yet. Tap “Follow” on a player, team or ground.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {players.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Players ({data.players.total})</p>
          <div className="space-y-2">
            {players.map((p) => (
              <Link
                key={p.publicPlayerId}
                to={`/players/${p.publicPlayerId}`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
              >
                <Avatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{p.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {roleLabel(p.role) || 'Player'}
                    {p.team ? ` · ${p.team.name}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Teams ({data.teams.total})</p>
          <div className="space-y-2">
            {teams.map((t) => (
              <Link
                key={t.id}
                to={`/teams/${t.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
              >
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt={t.name} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-200">
                    {(t.shortName || t.name || 'T').slice(0, 2)}
                  </span>
                )}
                <p className="truncate text-sm font-bold text-white">{t.name}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {grounds.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Grounds ({data.grounds.total})</p>
          <div className="space-y-2">
            {grounds.map((g) => (
              <Link
                key={g.publicGroundId}
                to={`/grounds/${g.publicGroundId}`}
                className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 transition-colors hover:bg-white/10"
              >
                {g.primaryPhoto ? (
                  <img src={g.primaryPhoto} alt={g.name} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                    <MapPin className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{g.name}</p>
                  {(g.city || g.state) && (
                    <p className="truncate text-xs text-slate-400">{[g.city, g.state].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
