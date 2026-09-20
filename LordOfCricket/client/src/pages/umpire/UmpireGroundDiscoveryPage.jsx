import { MapPinOff, SearchX } from 'lucide-react'
import UmpireLayout from '../../components/umpire-dashboard/UmpireLayout.jsx'
import LocationSelector from '../../components/ground/LocationSelector.jsx'
import GroundDiscoveryCard from '../../components/umpire-dashboard/GroundDiscoveryCard.jsx'
import GroundDiscoveryCardSkeleton from '../../components/umpire-dashboard/GroundDiscoveryCardSkeleton.jsx'
import { StatsErrorState } from '../../components/stats/StatsStates.jsx'
import { useUmpireGroundDiscovery } from '../../hooks/useUmpireGroundDiscovery.js'

export default function UmpireGroundDiscoveryPage() {
  const {
    mode,
    city,
    radiusKm,
    grounds,
    pagination,
    anyGroundsExist,
    loading,
    loadingMore,
    error,
    hasMore,
    searchByCity,
    searchNearby,
    browseAll,
    loadMore,
    retry,
    applyingMatchId,
    applyResults,
    apply,
  } = useUmpireGroundDiscovery()

  return (
    <UmpireLayout title="Grounds for Umpire" subtitle="Every ground with an upcoming umpiring opportunity — refine by city or distance if you'd like.">
      <div className="flex flex-col gap-6">
        <LocationSelector mode={mode} city={city} radiusKm={radiusKm} onSearchCity={searchByCity} onSearchNearby={searchNearby} onBrowseAll={browseAll} />

        {!loading && !error && pagination && pagination.total > 0 && (
          <p className="text-xs font-semibold uppercase tracking-widest text-loc-muted-dark">
            {pagination.total} ground{pagination.total === 1 ? '' : 's'} with an opportunity
          </p>
        )}

        {loading && (
          <div className="flex flex-col gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <GroundDiscoveryCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && error && <StatsErrorState message={error} onRetry={retry} />}

        {!loading && !error && grounds.length === 0 && !anyGroundsExist && (
          <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-white/10 bg-loc-card-dark/40 px-6 py-16 text-center">
            <MapPinOff className="h-8 w-8 text-loc-muted-dark" />
            <p className="text-loc-warmwhite">No grounds found for this filter.</p>
            {mode !== 'all' && (
              <button
                type="button"
                onClick={browseAll}
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-loc-warmwhite transition-colors hover:bg-white/10"
              >
                Show All Grounds
              </button>
            )}
          </div>
        )}

        {!loading && !error && grounds.length === 0 && anyGroundsExist && (
          <div className="flex flex-col items-center gap-3 rounded-[28px] border border-dashed border-white/10 bg-loc-card-dark/40 px-6 py-16 text-center">
            <SearchX className="h-8 w-8 text-loc-muted-dark" />
            <p className="text-loc-warmwhite">No umpiring opportunities available right now.</p>
            <p className="text-sm text-loc-text2-dark">Check back later, or try a different city/distance filter.</p>
            {mode !== 'all' && (
              <button
                type="button"
                onClick={browseAll}
                className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-loc-warmwhite transition-colors hover:bg-white/10"
              >
                Show All Grounds
              </button>
            )}
          </div>
        )}

        {!loading && !error && grounds.length > 0 && (
          <div className="flex flex-col gap-6">
            {grounds.map((ground) => (
              <GroundDiscoveryCard
                key={ground.publicGroundId}
                ground={ground}
                applyingMatchId={applyingMatchId}
                applyResults={applyResults}
                onApply={apply}
              />
            ))}
          </div>
        )}

        {!loading && !error && hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="self-center rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-loc-warmwhite transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load More Grounds'}
          </button>
        )}
      </div>
    </UmpireLayout>
  )
}
