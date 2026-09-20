import PublicAvailabilityPreview from '../booking/PublicAvailabilityPreview.jsx'
import { PanelSurface } from './PanelStates.jsx'

export default function BookStadiumPanel({ publicGroundId = null, onBook, className = '' }) {
  return (
    <PanelSurface className={className}>
      <div className="flex flex-col gap-4 h-full">
        <div>
          <p className="font-loc-display text-xs font-bold tracking-[0.18em] text-loc-gold uppercase">Book</p>
          <p className="mt-1 font-loc-display text-sm font-bold text-loc-warmwhite">The Stadium</p>
        </div>

        <div className="flex-1 flex flex-col justify-center min-h-0">
          <PublicAvailabilityPreview compact publicGroundId={publicGroundId} />
        </div>

        <button
          type="button"
          onClick={onBook}
          className="w-full rounded-full bg-loc-stadium px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-loc-warmwhite shadow-md shadow-loc-gold/20 transition-all duration-200 hover:bg-loc-stadium-hover hover:shadow-loc-gold/40"
        >
          Book Now →
        </button>
      </div>
    </PanelSurface>
  )
}
