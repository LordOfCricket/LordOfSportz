import { useEffect } from 'react'

function AmenityBadge({ amenity }) {
  return (
    <div className="inline-flex shrink-0 items-center gap-3 rounded-full border border-[#D4AF37]/30 bg-[#064B38]/40 px-4 py-2 backdrop-blur-sm hover:border-[#D4AF37]/60 hover:bg-[#064B38]/60 transition-all whitespace-nowrap">
      <span className="text-sm font-medium text-[#F5F7F5]">
        {typeof amenity === 'string' ? amenity : amenity.name}
      </span>
    </div>
  )
}

export default function AmenitiesMarquee({ amenities = [] }) {
  useEffect(() => {
    // Inject keyframe animation once on mount
    if (!document.querySelector('style[data-marquee-simple]')) {
      const style = document.createElement('style')
      style.setAttribute('data-marquee-simple', 'true')
      style.textContent = `
        @keyframes marquee-simple {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-25%);
          }
        }

        .marquee-track {
          animation: marquee-simple 28s linear infinite;
        }

        .marquee-track:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none !important;
          }
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  if (!amenities || amenities.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[#B5C2BC]">No amenities added yet</p>
      </div>
    )
  }

  // Duplicate the amenities 4 times to create a very wide track
  // This ensures the track is much wider than the viewport
  const duplicatedAmenities = Array.from({ length: 4 }, () => amenities).flat()

  return (
    <div className="w-full overflow-hidden">
      {/* Simple flex track: no centering, no max-width, natural positioning */}
      <div className="marquee-track flex w-fit gap-3 flex-shrink-0 flex-nowrap">
        {duplicatedAmenities.map((amenity, index) => (
          <div key={`${index}-${typeof amenity === 'string' ? amenity : amenity.name}`}>
            <AmenityBadge amenity={amenity} />
          </div>
        ))}
      </div>
    </div>
  )
}
