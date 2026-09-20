// Real shimmer blocks matching GroundDiscoveryCard's 3-column shape —
// never leftover placeholder text ("Time Slots"/"Slots Available") once
// loading finishes.
export default function GroundDiscoveryCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-loc-card-dark/70 shadow-xl shadow-black/30">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-2 h-3 w-28 animate-pulse rounded-full bg-white/5" />
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,240px)_1fr] lg:items-start lg:gap-6">
        <div className="h-64 animate-pulse rounded-2xl bg-white/10 sm:h-80 lg:h-72" />

        <div>
          <div className="mb-2 h-3 w-20 animate-pulse rounded-full bg-white/5" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 w-16 animate-pulse rounded-full bg-white/5" />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 h-3 w-32 animate-pulse rounded-full bg-white/5" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
