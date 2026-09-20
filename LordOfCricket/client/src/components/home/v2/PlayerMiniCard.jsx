import { Link } from 'react-router-dom'

export default function PlayerMiniCard({ to, category, name, subtitle, photoUrl, statLabel, statValue }) {
  return (
    <Link
      to={to}
      className="block overflow-hidden rounded-2xl border border-loc-border-soft bg-loc-surface no-underline shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <div className="relative h-44 w-full overflow-hidden bg-loc-mint">
        {photoUrl ? (
          <img src={photoUrl} alt={name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl">🏏</div>
        )}
        {category && (
          <div className="absolute left-3 top-3 rounded-full bg-loc-surface px-3 py-1 text-xs font-bold uppercase tracking-wide text-loc-green shadow-sm">
            {category}
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="truncate text-base font-bold text-loc-navy">{name}</h3>
        {subtitle && <p className="mt-1 truncate text-sm text-loc-muted">{subtitle}</p>}
        {(statLabel || statValue != null) && (
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-loc-border-soft pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-loc-faint">{statLabel}</span>
            <span className="text-lg font-black text-loc-green">{statValue ?? '—'}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
