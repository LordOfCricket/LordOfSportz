import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

export default function GroundMiniCard({ ground, onBook }) {
  const location = [ground.city, ground.state].filter(Boolean).join(', ')
  const hasRating = ground.ratingAvg != null && (ground.ratingCount ?? 0) > 0

  return (
    <article className="flex w-[240px] shrink-0 flex-col overflow-hidden rounded-2xl border border-loc-border-soft bg-loc-surface shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <Link to={`/grounds/${ground.publicGroundId}`} className="relative block h-32 w-full overflow-hidden bg-loc-mint no-underline">
        {ground.primaryPhoto ? (
          <img src={ground.primaryPhoto} alt={ground.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">🏏</div>
        )}
        {hasRating && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-loc-surface px-2.5 py-1 text-xs font-bold text-slate-800 shadow-sm">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            <span>{Number(ground.ratingAvg).toFixed(1)}</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link to={`/grounds/${ground.publicGroundId}`} className="no-underline">
          <h3 className="truncate text-base font-bold text-loc-navy">{ground.name}</h3>
          {location && <p className="mt-1 truncate text-sm text-loc-muted">{location}</p>}
        </Link>

        {onBook && (
          <button
            type="button"
            onClick={() => onBook(ground)}
            className="mt-3 rounded-full bg-loc-green px-3 py-2 text-sm font-semibold text-white transition hover:bg-loc-green-strong"
          >
            Book Now
          </button>
        )}
      </div>
    </article>
  )
}
