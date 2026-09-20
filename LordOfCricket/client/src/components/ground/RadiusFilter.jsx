import { RADIUS_OPTIONS_KM } from '../../models/groundDiscovery.model.js'

// Three-to-four fixed presets, not a slider/custom-input panel — "WITHIN
// 5KM / 10KM / 15KM / 25KM" per the brief. Changing the value is the
// caller's cue to refetch — this component owns no fetching itself.
export default function RadiusFilter({ radiusKm, onChange }) {
  return (
    <div role="group" aria-label="Search radius" className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-400/15 bg-white/5 p-1">
      {RADIUS_OPTIONS_KM.map((km) => (
        <button
          key={km}
          type="button"
          aria-pressed={radiusKm === km}
          onClick={() => onChange(km)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${
            radiusKm === km ? 'bg-emerald-500 text-emerald-950' : 'text-emerald-100/70 hover:text-white'
          }`}
        >
          {km} km
        </button>
      ))}
    </div>
  )
}
