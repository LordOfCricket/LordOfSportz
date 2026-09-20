import { useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar.jsx'
import { roleLabel } from '../../models/player.model.js'

function fmt(n) {
  return n == null ? '—' : n
}

// Role only changes which two numbers are emphasized — batting
// figures are never hidden for a bowler, and vice versa.
const BOWLING_PRIMARY_ROLES = new Set(['BOWLER', 'ALL_ROUNDER'])

export default function PlayerCard({ player, career, light = false }) {
  const navigate = useNavigate()
  const bowlingFirst = BOWLING_PRIMARY_ROLES.has(player.role)
  const labelCls = light ? 'text-loc-faint' : 'text-slate-400'
  const valueCls = light ? 'text-loc-navy' : 'text-white'

  const statCell = (label, value) => (
    <div>
      <p className={`text-[10px] uppercase tracking-wide ${labelCls}`}>{label}</p>
      <p className={`text-sm font-bold ${valueCls}`}>{value}</p>
    </div>
  )

  const battingStats = (
    <div className="grid grid-cols-4 gap-2 text-center">
      {statCell('Matches', fmt(career.matches))}
      {statCell('Runs', fmt(career.batting.runs))}
      {statCell('Avg', fmt(career.batting.average))}
      {statCell('SR', fmt(career.batting.strikeRate))}
    </div>
  )

  const bowlingStats = (
    <div className="grid grid-cols-4 gap-2 text-center">
      {statCell('Matches', fmt(career.matches))}
      {statCell('Wkts', fmt(career.bowling.wickets))}
      {statCell('Econ', fmt(career.bowling.economy))}
      {statCell('Best', career.bowling.bestBowling ? `${career.bowling.bestBowling.wickets}/${career.bowling.bestBowling.runs}` : '—')}
    </div>
  )

  return (
    <button
      type="button"
      onClick={() => navigate(`/players/${player.publicPlayerId}`)}
      className={
        light
          ? 'group flex w-full flex-col gap-4 rounded-2xl border border-loc-border bg-loc-surface p-5 text-left shadow-loc transition-all hover:-translate-y-0.5 hover:shadow-loc-md'
          : 'group flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5 text-left shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400/30 hover:bg-slate-900/70'
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={player.name} photoUrl={player.photoUrl} size="md" />
        <div className="min-w-0">
          <p className={`truncate text-base font-bold ${valueCls}`}>{player.name}</p>
          <p className={`text-xs font-semibold ${light ? 'text-loc-green' : 'text-emerald-300'}`}>{roleLabel(player.role) || 'Role not set'}</p>
          {player.team && <p className={`truncate text-xs ${labelCls}`}>{player.team.name}</p>}
        </div>
      </div>

      {bowlingFirst ? bowlingStats : battingStats}

      <span
        className={`inline-flex items-center justify-center rounded-full border py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
          light ? 'border-loc-border text-loc-green group-hover:bg-loc-mint' : 'border-white/10 text-emerald-200 group-hover:bg-white/5'
        }`}
      >
        View Profile
      </span>
    </button>
  )
}
