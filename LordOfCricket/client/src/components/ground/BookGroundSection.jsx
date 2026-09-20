import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAllGrounds } from '../../hooks/useAllGrounds.js'
import ScrollReveal from '../common/ScrollReveal.jsx'
import BookingModal from '../booking/BookingModal.jsx'
import { fadeUpSoft } from '../../lib/revealVariants.js'

const MAX_CARDS = 8

// No rating shown here — no ground has ever been reviewed (no reviews
// table exists at all yet), so a star badge would be fabricated data, the
// one thing this whole homepage rebuild has deliberately never done
// (GroundCard/GroundFiltersBar both omit fields the schema doesn't back
// rather than faking them). Revisit once real reviews exist.
function BookGroundCard({ ground, onBookNow }) {
  return (
    <div className="flex w-88 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-emerald-400/15 bg-white/5 shadow-lg shadow-black/20 sm:w-104">
      <Link to={`/grounds/${ground.publicGroundId}`} className="group relative block h-72 w-full overflow-hidden bg-loc-card-dark">
        {ground.primaryPhoto ? (
          <img
            src={ground.primaryPhoto}
            alt={ground.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <img src="/images/cricket-stadium.jpg" alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-cover opacity-40" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate text-lg font-semibold text-white">{ground.name}</h3>
          {(ground.city || ground.state) && (
            <p className="truncate text-sm text-emerald-100/70">{[ground.city, ground.state].filter(Boolean).join(', ')}</p>
          )}
        </div>
      </Link>

      <div className="flex gap-2 p-4">
        {/* Opens the real booking flow (BookingModal — pick a date, a real
            availability check, pick a slot, then a login gate if needed),
            scoped to THIS card's ground (Ground Time-Slot Pricing — booking
            is now ground-scoped end to end, see BookingModal's publicGroundId
            prop). */}
        <button
          type="button"
          onClick={() => onBookNow(ground)}
          className="flex-1 rounded-full bg-emerald-500 px-3 py-2.5 text-center text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
        >
          Book Now
        </button>
        <Link
          to={`/grounds/${ground.publicGroundId}#amenities`}
          className="flex-1 rounded-full border border-emerald-400/30 px-3 py-2.5 text-center text-sm font-semibold text-emerald-100/80 transition-colors hover:border-emerald-400/60 hover:text-white"
        >
          Check Amenities
        </Link>
      </div>
    </div>
  )
}

// "Book Ground" — sits under About Us. Real ACTIVE grounds (alphabetical,
// same browse-all source as the Grounds page) in a single scrollable row of
// cards, matching the brief's "kind of cards ... in a row" shape. Renders
// nothing once loaded if there are zero grounds.
export default function BookGroundSection() {
  const { grounds, loading, error } = useAllGrounds({ sort: 'name', limit: MAX_CARDS })
  const [bookingGround, setBookingGround] = useState(null)

  if (!loading && !error && grounds.length === 0) return null

  return (
    <div className="flex w-full flex-col items-center gap-10 px-6 py-6">
      <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold uppercase tracking-widest text-emerald-400">Book Your Match</span>
        <h2 className="font-loc-display text-4xl font-extrabold tracking-[0.04em] text-loc-gold uppercase sm:text-5xl">
          Reserve A Ground In Minutes.
        </h2>
      </ScrollReveal>

      <div className="flex w-full max-w-6xl gap-6 overflow-x-auto px-1 pb-2 snap-x snap-mandatory">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-92 w-88 shrink-0 animate-pulse rounded-2xl border border-emerald-400/10 bg-white/5 sm:w-104" />)}
        {!loading && !error && grounds.map((ground) => <BookGroundCard key={ground.publicGroundId} ground={ground} onBookNow={() => setBookingGround(ground)} />)}
      </div>

      <BookingModal open={Boolean(bookingGround)} onClose={() => setBookingGround(null)} publicGroundId={bookingGround?.publicGroundId} />
    </div>
  )
}
