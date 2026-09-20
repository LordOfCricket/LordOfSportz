import { Star } from 'lucide-react'

// Phase 13 — shared star-rating display for GroundCard and GroundHomePage.
// Renders ONLY the numeric average + review count (never written comments,
// never reviewer identity) — see the Phase 13 report's security note on why
// public display stays numbers-only. `ratingAvg === null` is the honest
// "no reviews yet" state (grounds.rating_avg/rating_count, never fabricated)
// and renders the empty variant instead of a fake "0.0".
export default function RatingBadge({ ratingAvg, ratingCount, size = 'sm' }) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  const textSize = size === 'lg' ? 'text-lg' : 'text-xs'

  if (ratingAvg === null || ratingAvg === undefined) {
    return <span className={`text-loc-faint ${textSize}`}>No reviews yet</span>
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-loc-muted ${textSize}`}>
      <Star className={`${iconSize} shrink-0 fill-amber-400 text-amber-400`} aria-hidden="true" />
      <span className="text-loc-navy">{ratingAvg.toFixed(1)}</span>
      <span className="text-loc-faint">
        ({ratingCount} {ratingCount === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  )
}
