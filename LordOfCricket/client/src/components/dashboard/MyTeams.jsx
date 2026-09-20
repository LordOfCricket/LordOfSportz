import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { roleLabel } from '../../models/player.model.js'

export default function MyTeams({ team, player }) {
  const navigate = useNavigate()

  return (
    <div id="teams" className="rounded-[1.5rem] border border-white/10 bg-slate-900/50 p-6 shadow-sm backdrop-blur-sm scroll-mt-24">
      <h2 className="text-xl font-semibold text-white">My Teams</h2>

      {team ? (
        <button
          type="button"
          onClick={() => navigate(`/teams/${team.id}`)}
          className="mt-4 flex w-full items-center gap-4 rounded-2xl bg-white/5 px-4 py-4 text-left transition-colors hover:bg-white/10"
        >
          {team.logo_url ? (
            <img src={team.logo_url} alt={team.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-200">
              {team.short_name}
            </span>
          )}
          <div>
            <p className="font-semibold text-white">{team.name}</p>
            <p className="text-sm text-slate-300">{roleLabel(player?.role) || 'Playing role not set'}</p>
          </div>
        </button>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-6 py-10 text-center">
          <Users className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-300">You haven't joined a team yet.</p>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="mt-1 cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Join Team
          </button>
        </div>
      )}
    </div>
  )
}
