import { useNavigate } from 'react-router-dom'
import { roleLabel } from '../../models/player.model.js'
import Avatar from '../ui/Avatar.jsx'

function formatValue(value, category, metric) {
  if (value == null) return '—'
  if (metric === 'best-bowling') return `${value.wickets}/${value.runs}`
  return value
}

function secondaryLine(item, category) {
  const secondary = item.secondary || {}
  if (category === 'batting') return `Avg ${secondary.average ?? '—'} • SR ${secondary.strikeRate ?? '—'}`
  if (category === 'bowling') return `Avg ${secondary.average ?? '—'} • Econ ${secondary.economy ?? '—'}`
  return `${secondary.matches ?? '—'} matches`
}

export default function LeaderboardRow({ item, category, metric, unit }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(`/players/${item.player.publicPlayerId}`)}
      className="flex w-full items-center gap-4 rounded-2xl bg-loc-mint px-4 py-3 text-left transition-colors hover:bg-loc-mint"
    >
      <span className="w-8 shrink-0 text-center text-sm font-extrabold text-loc-faint">#{item.rank}</span>
      <Avatar name={item.player.name} photoUrl={item.player.photoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-loc-navy">{item.player.name}</p>
        <p className="truncate text-xs text-loc-faint">
          {roleLabel(item.player.role) || 'Player'}
          {item.player.team ? ` • ${item.player.team.name}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-extrabold text-loc-green">
          {formatValue(item.value, category, metric)} {unit}
        </p>
        <p className="text-[11px] text-loc-faint">{secondaryLine(item, category)}</p>
      </div>
    </button>
  )
}
