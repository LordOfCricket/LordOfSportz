import { useState } from 'react'
import { MapPin, ListChecks } from 'lucide-react'
import GroundGallery from '../home/GroundGallery.jsx'
import SlotRow from './SlotRow.jsx'
import { formatDistance } from '../../models/groundDiscovery.model.js'

const VISIBLE_AMENITIES = 6

function AmenitiesPanel({ amenities }) {
  const [expanded, setExpanded] = useState(false)
  if (amenities.length === 0) {
    return <p className="text-xs text-loc-muted-dark">No amenities listed for this ground yet.</p>
  }
  const visible = expanded ? amenities : amenities.slice(0, VISIBLE_AMENITIES)
  const extraCount = amenities.length - visible.length

  return (
    <div className="flex flex-wrap content-start gap-1.5">
      {visible.map((name) => (
        <span key={name} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-emerald-100/70">
          {name}
        </span>
      ))}
      {extraCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-loc-gold transition-colors hover:bg-white/10"
        >
          +{extraCount} more
        </button>
      )}
    </div>
  )
}

// One ground = one large card. Desktop: photos | amenities | slot rows,
// laid out as a fixed-column grid. Mobile: the same DOM collapses to a
// single stacked column (grid-cols-1) in the order header -> photos ->
// amenities -> slot rows, so no separate mobile layout is needed.
export default function GroundDiscoveryCard({ ground, applyingMatchId, applyResults, onApply }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/10 bg-loc-card-dark/70 shadow-xl shadow-black/30 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="truncate font-loc-display text-lg font-bold tracking-wide text-loc-warmwhite uppercase">{ground.name}</h3>
          {(ground.city || ground.state) && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-loc-text2-dark">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-loc-gold" aria-hidden="true" />
              {[ground.city, ground.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {typeof ground.distanceKm === 'number' && (
          <span className="shrink-0 rounded-full bg-loc-dark/80 px-3 py-1 text-xs font-semibold text-emerald-100">
            {formatDistance(ground.distanceKm)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,240px)_1fr] lg:items-start lg:gap-6">
        <div className="lg:h-72">
          <GroundGallery photos={ground.photos} groundName={ground.name} />
        </div>

        <div>
          <p className="mb-2 font-loc-display text-xs font-bold tracking-[0.2em] text-loc-gold uppercase">Amenities</p>
          <AmenitiesPanel amenities={ground.amenities} />
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 font-loc-display text-xs font-bold tracking-[0.2em] text-loc-gold uppercase">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Upcoming Matches
          </p>
          <ul className="flex flex-col gap-2">
            {ground.matches.map((match) => (
              <SlotRow
                key={match.matchId}
                match={match}
                applying={applyingMatchId === match.matchId}
                result={applyResults[match.matchId]}
                onApply={() => onApply(match.matchId)}
              />
            ))}
          </ul>
        </div>
      </div>
    </article>
  )
}
