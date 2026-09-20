import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { formatDistance, formatStartingPrice } from '../../models/groundDiscovery.model.js'
import RatingBadge from './RatingBadge.jsx'

const MAX_VISIBLE_FACILITIES = 3

// Every field here comes straight from GET /api/grounds/search|nearby|
// (city/nearby/browse-all discovery); nothing is hardcoded per-ground.
// Navigation always uses the API's own publicGroundId, never an array
// index or numeric id. Phase 13 — rating now DOES exist (grounds.rating_avg/
// rating_count, real match_feedback data) and is shown via RatingBadge.
// Ground Time-Slot Pricing — startingPrice is MIN(active pricing slot price)
// for this ground, or null (rendered as "Price on request") when none is
// configured yet — see formatStartingPrice.
export default function GroundCard({ ground }) {
  const facilities = ground.amenities || []
  const extraCount = Math.max(0, facilities.length - MAX_VISIBLE_FACILITIES)

  return (
    <Link
      to={`/grounds/${ground.publicGroundId}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-loc-border bg-loc-surface  transition-all duration-300 hover:-translate-y-1 hover:border-loc-green hover:shadow-loc-md"
    >
      <div className="relative h-44 w-full overflow-hidden bg-loc-mint">
        {ground.primaryPhoto ? (
          <img
            src={ground.primaryPhoto}
            alt={ground.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <img
            src="/images/cricket-stadium.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-cover opacity-40"
          />
        )}
        {typeof ground.distanceKm === 'number' && (
          <span className="absolute top-3 right-3 rounded-full bg-loc-navy/80 px-3 py-1 text-xs font-semibold text-loc-muted backdrop-blur-sm">
            {formatDistance(ground.distanceKm)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="text-lg font-semibold text-loc-navy">{ground.name}</h3>
          {(ground.city || ground.state) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-loc-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-loc-green" aria-hidden="true" />
              {[ground.city, ground.state].filter(Boolean).join(', ')}
            </p>
          )}
          <div className="mt-1.5">
            <RatingBadge ratingAvg={ground.ratingAvg} ratingCount={ground.ratingCount} />
          </div>
          <p className="mt-1.5 text-sm font-medium text-loc-green">{formatStartingPrice(ground.startingPrice)}</p>
        </div>

        {facilities.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {facilities.slice(0, MAX_VISIBLE_FACILITIES).map((facility) => (
              <span key={facility} className="rounded-full bg-loc-mint px-2.5 py-1 text-[11px] font-medium text-loc-muted">
                {facility}
              </span>
            ))}
            {extraCount > 0 && <span className="rounded-full bg-loc-mint px-2.5 py-1 text-[11px] font-medium text-loc-faint">+{extraCount} more</span>}
          </div>
        )}
      </div>
    </Link>
  )
}
