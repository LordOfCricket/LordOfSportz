import { useNavigate } from 'react-router-dom'
import TeamBadge from './TeamBadge.jsx'

// Public team directory card. Every number is
// already computed server-side by buildTeamCard.js.
export default function TeamCard({ team, light = false }) {
  const navigate = useNavigate()
  const label = light ? 'text-loc-faint' : 'text-slate-400'
  const value = light ? 'text-loc-navy' : 'text-white'

  return (
    <button
      type="button"
      onClick={() => navigate(`/teams/${team.id}`)}
      className={
        light
          ? 'flex w-full flex-col items-center gap-3 rounded-2xl border border-loc-border bg-loc-surface p-5 text-center shadow-loc transition-all hover:-translate-y-0.5 hover:shadow-loc-md'
          : 'flex w-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-slate-900/80'
      }
    >
      <TeamBadge team={team} size="lg" />
      <p className={`text-base font-bold ${value}`}>{team.name}</p>
      <p className={`text-xs ${label}`}>
        {team.squadCount} {team.squadCount === 1 ? 'Player' : 'Players'}
      </p>

      <div className="grid w-full grid-cols-2 gap-2 text-center">
        <div className={`rounded-xl px-2 py-2 ${light ? 'bg-loc-mint' : 'bg-white/5'}`}>
          <p className={`text-lg font-bold ${value}`}>{team.matchCount}</p>
          <p className={`text-[10px] uppercase tracking-wide ${label}`}>Matches</p>
        </div>
        <div className={`rounded-xl px-2 py-2 ${light ? 'bg-loc-mint' : 'bg-white/5'}`}>
          <p className={`text-lg font-bold ${light ? 'text-loc-green' : 'text-emerald-300'}`}>{team.wins}</p>
          <p className={`text-[10px] uppercase tracking-wide ${label}`}>Wins</p>
        </div>
      </div>

      <span
        className={`inline-flex w-full items-center justify-center rounded-full border py-2 text-xs font-bold uppercase tracking-wide ${
          light ? 'border-loc-border text-loc-green' : 'border-white/10 text-emerald-200'
        }`}
      >
        View Team
      </span>
    </button>
  )
}
