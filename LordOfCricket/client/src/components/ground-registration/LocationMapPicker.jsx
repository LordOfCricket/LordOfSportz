import { useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, LocateFixed } from 'lucide-react'
import { geocodeLandmark } from '../../services/geocodeApi.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'

// Vite bundles Leaflet's default marker icon URLs incorrectly unless
// re-pointed at the actual bundled asset URLs — the standard, documented
// react-leaflet/Vite workaround (Leaflet's own CSS references relative
// image paths that don't survive bundling).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

const DEFAULT_CENTER = [20.5937, 78.9629] // India, roughly centered — a sensible default before any location is chosen
const DEFAULT_ZOOM = 5
const CHOSEN_ZOOM = 15

function ClickToMove({ onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// New Leaflet + OpenStreetMap map, paired with the EXISTING Nominatim-backed
// /api/geocode endpoint for the search box — no second geocoding provider,
// no paid/keyed map service. No map/location picker existed anywhere in
// this codebase before this feature (confirmed by inspection); this is
// intentionally the smallest useful one: search-to-move, click-to-move,
// drag-the-marker, "Use My Location" (reusing the existing useGeolocation
// hook the old form already had). No drag-to-reorder-style extras.
export default function LocationMapPicker({ latitude, longitude, onChange }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const geo = useGeolocation()

  const hasPosition = typeof latitude === 'number' && typeof longitude === 'number'
  const center = hasPosition ? [latitude, longitude] : DEFAULT_CENTER

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError('')
    try {
      const result = await geocodeLandmark(query.trim())
      onChange(result.latitude, result.longitude)
    } catch (err) {
      setSearchError(err.response?.data?.error || 'Could not find that location. Try a more specific search, or place the marker manually.')
    } finally {
      setSearching(false)
    }
  }

  const handleUseMyLocation = () => {
    geo.requestLocation((coords) => onChange(coords.latitude, coords.longitude))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for your ground's area or a nearby landmark"
            className="flex-1 rounded-xl border border-emerald-400/20 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-emerald-100/30 focus:border-emerald-400/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/20 px-3 py-2.5 text-xs font-semibold text-emerald-100/80 transition-colors hover:border-emerald-400/50 hover:text-white disabled:opacity-60"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geo.status === 'prompting'}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 px-3 py-2.5 text-xs font-semibold text-emerald-100/80 transition-colors hover:border-emerald-400/50 hover:text-white disabled:opacity-60"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          {geo.status === 'prompting' ? 'Locating…' : 'Use My Location'}
        </button>
      </div>
      {searchError && <p className="text-xs text-amber-300/80">{searchError}</p>}

      <div className="h-64 w-full overflow-hidden rounded-2xl border border-emerald-400/20 sm:h-80">
        <MapContainer center={center} zoom={hasPosition ? CHOSEN_ZOOM : DEFAULT_ZOOM} className="h-full w-full" key={hasPosition ? 'chosen' : 'default'}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickToMove onMove={onChange} />
          {hasPosition && (
            <Marker
              position={center}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const latlng = e.target.getLatLng()
                  onChange(latlng.lat, latlng.lng)
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-emerald-100/50">
        {hasPosition ? 'Drag the marker or click anywhere on the map to fine-tune the exact spot.' : 'Search above, use your current location, or click on the map to place a marker.'}
      </p>
    </div>
  )
}
