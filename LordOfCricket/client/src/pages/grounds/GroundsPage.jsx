import { useMemo, useState } from 'react'
import { useSeoMeta } from '../../hooks/useSeoMeta.js'
import { MapPin } from 'lucide-react'
import Navbar from '../../components/home/Navbar.jsx'
import SiteFooter from '../../components/home/SiteFooter.jsx'
import ScrollReveal from '../../components/common/ScrollReveal.jsx'
import GroundCard from '../../components/ground/GroundCard.jsx'
import GroundCardSkeleton from '../../components/ground/GroundCardSkeleton.jsx'
import GroundFiltersBar from '../../components/ground/GroundFiltersBar.jsx'
import LandmarkSearch from '../../components/ground/LandmarkSearch.jsx'
import KmRangeSlider from '../../components/ground/KmRangeSlider.jsx'
import { useAllGrounds } from '../../hooks/useAllGrounds.js'
import { useGroundSearch } from '../../hooks/useGroundSearch.js'
import { DEFAULT_RADIUS_KM, DEFAULT_PAGE_SIZE } from '../../models/groundDiscovery.model.js'
import { fadeUpSoft } from '../../lib/revealVariants.js'

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-loc-muted">{message}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-red-600">{message || 'Something went wrong loading grounds.'}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-loc-green px-6 py-2 text-sm font-semibold text-white transition hover:bg-loc-green-strong"
      >
        Retry
      </button>
    </div>
  )
}

function LeftSidebar({ cities, selectedCity, onCitySelect, selectedFacilities, onFacilitiesChange, grounds, isSearchMode, searchCoords, onBackToAll, radiusKm, onRadiusCommit, onResolved }) {
  return (
    <aside className="w-full lg:w-80 lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-loc-border flex-shrink-0">
      <div className="sticky top-32 space-y-8 px-6 lg:px-10 pt-32 lg:pb-20">
        {/* Search & Nearby */}
        {!isSearchMode && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase text-loc-green">Search Nearby</h3>
            <LandmarkSearch compact onResolved={onResolved} />
          </div>
        )}

        {isSearchMode && (
          <div className="space-y-3 rounded-lg border border-loc-border bg-loc-surface p-3">
            <div className="flex items-start gap-2 text-xs text-loc-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-loc-green mt-0.5" aria-hidden="true" />
              <span>
                Within {radiusKm} km of <span className="font-semibold text-loc-navy">{searchCoords.label}</span>
              </span>
            </div>
            <KmRangeSlider value={radiusKm} onCommit={onRadiusCommit} compact />
            <button type="button" onClick={onBackToAll} className="text-xs font-semibold text-loc-green hover:underline">
              Clear Search
            </button>
          </div>
        )}

        {/* City Filter */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase text-loc-green">Filter by City</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            <button
              onClick={() => onCitySelect(null)}
              className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                selectedCity === null
                  ? 'bg-loc-mint text-loc-navy font-semibold'
                  : 'text-loc-muted hover:bg-loc-mint'
              }`}
            >
              All Cities
            </button>
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => onCitySelect(city)}
                className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedCity === city
                    ? 'bg-loc-mint text-loc-navy font-semibold'
                    : 'text-loc-muted hover:bg-loc-mint'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>

        {/* Facilities Filter */}
        {grounds.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase text-loc-green">Facilities</h3>
            <GroundFiltersBar grounds={grounds} selectedFacilities={selectedFacilities} onChange={onFacilitiesChange} />
          </div>
        )}
      </div>
    </aside>
  )
}

export default function GroundsPage() {
  useSeoMeta({
    title: 'Browse Cricket Grounds — Lord Of Cricket',
    description: 'Browse every cricket ground registered on Lord Of Cricket — search by city, distance, or facilities and book your next match.',
    canonical: `${window.location.origin}/grounds`,
  })

  const [selectedCity, setSelectedCity] = useState(null)
  const [selectedFacilities, setSelectedFacilities] = useState([])
  const [searchCoords, setSearchCoords] = useState(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)

  const browse = useAllGrounds({ sort: 'city', limit: DEFAULT_PAGE_SIZE })
  const search = useGroundSearch()

  const isSearchMode = searchCoords !== null
  const active = isSearchMode
    ? { grounds: search.grounds, loading: search.loading, loadingMore: search.loadingMore, error: search.error, hasMore: search.hasMore, loadMore: search.loadMore, retry: search.retry }
    : { grounds: browse.grounds, loading: browse.loading, loadingMore: browse.loadingMore, error: browse.error, hasMore: browse.hasMore, loadMore: browse.loadMore, retry: browse.retry }

  // Extract unique cities and sort alphabetically
  const cities = useMemo(
    () => [...new Set(active.grounds.map((g) => g.city).filter(Boolean))].sort(),
    [active.grounds],
  )

  // Filter by city and facilities
  const visibleGrounds = useMemo(() => {
    let filtered = active.grounds

    // Filter by city
    if (selectedCity) {
      filtered = filtered.filter((g) => g.city === selectedCity)
    }

    // Filter by facilities
    if (selectedFacilities.length > 0) {
      filtered = filtered.filter((g) => selectedFacilities.every((f) => (g.amenities || []).includes(f)))
    }

    // Sort by city, then by name
    filtered.sort((a, b) => {
      const cityCompare = (a.city || '').localeCompare(b.city || '')
      if (cityCompare !== 0) return cityCompare
      return (a.name || '').localeCompare(b.name || '')
    })

    return filtered
  }, [active.grounds, selectedCity, selectedFacilities])

  const handleResolved = ({ latitude, longitude, label }) => {
    setSearchCoords({ latitude, longitude, label })
    search.searchNearby(latitude, longitude, radiusKm)
  }

  const handleRadiusCommit = (km) => {
    setRadiusKm(km)
    if (searchCoords) search.searchNearby(searchCoords.latitude, searchCoords.longitude, km)
  }

  const handleBackToAll = () => {
    setSearchCoords(null)
    search.reset()
    setSelectedFacilities([])
  }

  return (
    <div className="loc-page flex flex-col overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative w-full pt-32 pb-20 flex-1">
        {/* Page Title */}
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-10 mb-10">
          <ScrollReveal variant={fadeUpSoft} amount={0.4} className="flex w-full flex-col items-center gap-3 text-center">
            <h1 className="loc-heading text-3xl sm:text-4xl">
              Every Ground Registered on LOC
            </h1>
          </ScrollReveal>
        </div>

        {/* Main Layout: Sidebar + Grid */}
        <div className="flex flex-col lg:flex-row lg:ml-80">
          {/* Left Sidebar */}
          <LeftSidebar
            cities={cities}
            selectedCity={selectedCity}
            onCitySelect={setSelectedCity}
            selectedFacilities={selectedFacilities}
            onFacilitiesChange={setSelectedFacilities}
            grounds={active.grounds}
            isSearchMode={isSearchMode}
            searchCoords={searchCoords}
            onBackToAll={handleBackToAll}
            radiusKm={radiusKm}
            onRadiusCommit={handleRadiusCommit}
            onResolved={handleResolved}
          />

          {/* Main Content */}
          <div className="flex-1 min-w-0 mx-auto w-full max-w-7xl px-6 lg:px-10">
            <div className="flex w-full flex-col gap-6">
              {/* Results Header */}
              {active.grounds.length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-widest text-loc-faint">
                    {visibleGrounds.length} {visibleGrounds.length === 1 ? 'Ground' : 'Grounds'}
                  </p>
                </div>
              )}

              {/* Grounds Grid */}
              <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {active.loading && Array.from({ length: 6 }).map((_, i) => <GroundCardSkeleton key={i} />)}
                {!active.loading && !active.error && visibleGrounds.map((ground) => <GroundCard key={ground.publicGroundId} ground={ground} />)}
              </div>

              {/* Error State */}
              {!active.loading && active.error && <ErrorState message={active.error} onRetry={active.retry} />}

              {/* Empty States */}
              {!active.loading && !active.error && active.grounds.length === 0 && (
                <EmptyState message={isSearchMode ? 'No cricket grounds found within this radius. Try widening it.' : 'No grounds are registered yet.'} />
              )}

              {!active.loading && !active.error && active.grounds.length > 0 && visibleGrounds.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-loc-muted">No grounds match the selected filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCity(null)
                      setSelectedFacilities([])
                    }}
                    className="mt-4 inline-flex rounded-full bg-loc-green px-6 py-2 text-sm font-semibold text-white transition hover:bg-loc-green-strong"
                  >
                    Clear Filters
                  </button>
                </div>
              )}

              {/* Load More Button */}
              {!active.loading && !active.error && active.hasMore && (
                <button
                  type="button"
                  onClick={active.loadMore}
                  disabled={active.loadingMore}
                  className="self-center rounded-full border border-loc-border px-6 py-2.5 text-sm font-semibold text-loc-navy transition-colors hover:border-loc-green hover:text-loc-green disabled:opacity-50"
                >
                  {active.loadingMore ? 'Loading…' : 'Load More'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter theme="light" />
    </div>
  )
}
