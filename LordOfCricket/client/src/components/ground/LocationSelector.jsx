import { useState } from 'react'
import { LocateFixed, MapPin, Globe2 } from 'lucide-react'
import CitySelector from './CitySelector.jsx'
import RadiusFilter from './RadiusFilter.jsx'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { DEFAULT_RADIUS_KM } from '../../models/groundDiscovery.model.js'

// A compact, always-visible refine bar — never a full-page gate the umpire
// has to get past before seeing anything (the page already shows every
// ground with an upcoming match by default; this only narrows that list).
export default function LocationSelector({ mode, city, radiusKm, onSearchCity, onSearchNearby, onBrowseAll }) {
  const geo = useGeolocation()
  const [cityPickerOpen, setCityPickerOpen] = useState(false)

  const handleFindNearMe = () => {
    geo.requestLocation((coords) => onSearchNearby(coords.latitude, coords.longitude, radiusKm ?? DEFAULT_RADIUS_KM))
  }

  const handleSelectCity = (selected) => {
    setCityPickerOpen(false)
    onSearchCity(selected)
  }

  const pillClass = (active) =>
    `flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
      active ? 'bg-loc-gold text-loc-dark' : 'text-loc-text2-dark hover:bg-white/10 hover:text-loc-warmwhite'
    }`

  return (
    <div className="rounded-2xl border border-white/10 bg-loc-card-dark/60 p-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={mode === 'all'} onClick={onBrowseAll} className={pillClass(mode === 'all')}>
          <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
          All Grounds
        </button>

        <button type="button" aria-pressed={mode === 'city'} onClick={() => setCityPickerOpen((v) => !v)} className={pillClass(mode === 'city')}>
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {mode === 'city' && city ? city : 'By City'}
        </button>

        <button
          type="button"
          aria-pressed={mode === 'nearby'}
          onClick={handleFindNearMe}
          disabled={geo.status === 'prompting'}
          className={`${pillClass(mode === 'nearby')} disabled:opacity-60`}
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          {geo.status === 'prompting' ? 'Locating…' : 'Near Me'}
        </button>

        {mode === 'nearby' && (
          <RadiusFilter radiusKm={radiusKm ?? DEFAULT_RADIUS_KM} onChange={(km) => onSearchNearby(geo.coords.latitude, geo.coords.longitude, km)} />
        )}
      </div>

      {cityPickerOpen && (
        <div className="mt-3">
          <CitySelector onSelect={handleSelectCity} />
        </div>
      )}

      {(geo.status === 'denied' || geo.status === 'unavailable') && (
        <p className="mt-3 text-xs text-amber-300/80" role="status">
          {geo.status === 'denied'
            ? 'Location access was denied — search by city instead.'
            : geo.error || "Location isn't available on this device — search by city instead."}
        </p>
      )}
    </div>
  )
}
