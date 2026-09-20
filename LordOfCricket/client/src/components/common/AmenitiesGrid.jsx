import useGlowHover from '../../hooks/useGlowHover.js'
import GlowOverlay from './GlowOverlay.jsx'
import ScrollReveal from './ScrollReveal.jsx'
import StaggerItem from './StaggerItem.jsx'
import { staggerContainer } from '../../lib/revealVariants.js'

function AmenityCard({ amenity }) {
  const { enabled: glowEnabled, ref: glowRef, onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } = useGlowHover()

  return (
    <div className="flex w-36 flex-col items-center gap-4 sm:w-44 lg:w-48">
      <div
        ref={glowRef}
        {...(glowEnabled ? { onPointerMove: onGlowMove, onPointerLeave: onGlowLeave } : {})}
        className="relative h-36 w-36 overflow-hidden rounded-2xl border border-emerald-400/15 shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:border-emerald-400/50 hover:shadow-emerald-500/20 sm:h-44 sm:w-44 lg:h-48 lg:w-48"
      >
        <img
          src={amenity.imageUrl}
          alt={amenity.name}
          className="h-full w-full object-cover"
        />
        {glowEnabled && <GlowOverlay />}
      </div>
      <span className="text-center text-base font-medium text-emerald-50 sm:text-lg">
        {amenity.name}
      </span>
    </div>
  )
}

// Takes the selected ground's own amenities as a prop
// (GET /api/grounds/:publicGroundId's `amenities` array) instead
// of self-fetching the unscoped GET /amenities list, which would leak
// every ground's amenities onto whichever ground's page rendered first.
export default function AmenitiesGrid({ amenities = [] }) {
  if (amenities.length === 0) {
    return <p className="text-emerald-100/60">No amenities added yet</p>
  }

  return (
    <ScrollReveal
      variant={staggerContainer(0.06)}
      amount={0.15}
      className="flex w-full flex-wrap justify-center gap-8 px-6 lg:gap-10 lg:px-10"
    >
      {amenities.map((amenity, i) => (
        <StaggerItem key={`${amenity.name}-${i}`}>
          <AmenityCard amenity={amenity} />
        </StaggerItem>
      ))}
    </ScrollReveal>
  )
}
