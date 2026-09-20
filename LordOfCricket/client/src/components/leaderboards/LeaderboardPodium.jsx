import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'

function formatValue(value, metric) {
  if (value == null) return '—'
  if (metric === 'best-bowling') return `${value.wickets}/${value.runs}`
  return value
}

function PodiumSlot({ item, unit, metric, size }) {
  const navigate = useNavigate()
  if (!item) return <div className="flex-1" />
  return (
    <button
      type="button"
      onClick={() => navigate(`/players/${item.player.publicPlayerId}`)}
      className={`flex flex-1 flex-col items-center gap-2 rounded-2xl loc-card px-4 py-5 text-center transition-colors hover:bg-loc-mint ${size === 'lg' ? 'sm:py-7' : ''}`}
    >
      {item.rank === 1 && <Trophy className="h-6 w-6 text-amber-700" />}
      <Avatar name={item.player.name} photoUrl={item.player.photoUrl} size={size === 'lg' ? 'lg' : 'md'} />
      <p className="text-sm font-bold text-loc-navy">#{item.rank} {item.player.name}</p>
      <p className="text-lg font-extrabold text-loc-green">
        {formatValue(item.value, metric)} <span className="text-xs font-semibold text-loc-faint">{unit}</span>
      </p>
    </button>
  )
}

export default function LeaderboardPodium({ items, unit, metric }) {
  const [first, second, third] = items
  return (
    <div className="flex items-stretch gap-3">
      <PodiumSlot item={second} unit={unit} metric={metric} />
      <PodiumSlot item={first} unit={unit} metric={metric} size="lg" />
      <PodiumSlot item={third} unit={unit} metric={metric} />
    </div>
  )
}
