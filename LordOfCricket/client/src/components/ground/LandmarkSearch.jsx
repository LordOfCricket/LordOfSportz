import { useState } from 'react'
import { LocateFixed, MapPin, Search } from 'lucide-react'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { geocodeLandmark } from '../../services/geocodeApi.js'

const MAX_QUERY_LENGTH = 150

// Grounds page — "give a landmark, in which around the landmark we will
// list out the grounds." Resolves free text to real coordinates via the
// backend's Nominatim-backed /api/geocode (geocodeLandmark), then hands the
// resolved { latitude, longitude, label } up to the caller, which owns the
// actual ground search. GPS ("📍 Use My Location") is offered as a
// secondary shortcut to the same resolved-coordinates contract — same
// pattern LocationSelector.jsx already uses on the homepage (geolocation
// only requested on explicit click, never on mount). The radius slider
// lives in the caller (GroundsPage's top filter bar) now, not here — one
// slider shared by both the pre-search and post-search state instead of
// this component owning its own copy.
export default function LandmarkSearch({ onResolved }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const geo = useGeolocation()

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const location = await geocodeLandmark(trimmed)
      onResolved({ latitude: location.latitude, longitude: location.longitude, label: location.displayName })
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't find that location.")
    } finally {
      setLoading(false)
    }
  }

  const handleUseMyLocation = () => {
    setError(null)
    geo.requestLocation((coords) => onResolved({ latitude: coords.latitude, longitude: coords.longitude, label: 'your location' }))
  }

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      <form onSubmit={handleSubmit} className="flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-loc-border bg-loc-mint pl-3">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-loc-green" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Search near a landmark"
          aria-label="Search near a landmark"
          className="h-full w-40 min-w-0 bg-transparent text-xs text-loc-navy placeholder:text-loc-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          aria-label="Search"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-loc-green px-2.5 text-xs font-semibold text-loc-navy transition hover:bg-loc-green-strong disabled:opacity-50"
        >
          <Search className="h-3 w-3" aria-hidden="true" />
          {loading ? '…' : 'Go'}
        </button>
      </form>

      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={geo.status === 'prompting'}
        title="Use My Location"
        aria-label="Use my location"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-loc-border text-loc-muted transition-colors hover:border-loc-green hover:text-loc-navy disabled:opacity-60"
      >
        <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {(error || geo.status === 'denied' || geo.status === 'unavailable') && (
        <p className="absolute top-full left-0 z-10 mt-1 w-56 rounded-lg bg-loc-surface px-2 py-1 text-xs text-amber-700 shadow-lg" role="status">
          {error || (geo.status === 'denied' ? 'Location access was denied — try a landmark search instead.' : geo.error || "Location isn't available on this device.")}
        </p>
      )}
    </div>
  )
}
