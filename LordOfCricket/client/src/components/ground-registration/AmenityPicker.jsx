import { Plus, X } from 'lucide-react'
import AmenityIcon from '../common/AmenityIcon.jsx'

// Catalog-driven multi-select (§7/§8/§33) — the Ground Owner picks from
// LOC's predefined list, never uploads/names their own amenity. `catalog`
// is [{key,name,icon}] from GET /ground-owner-requests/amenity-catalog;
// `selectedKeys` / `onChange(nextKeys)` is the whole selection, replaced on
// every click (small list, simplest correct state shape).
export default function AmenityPicker({ catalog, selectedKeys, onChange }) {
  const selectedSet = new Set(selectedKeys)
  const available = catalog.filter((a) => !selectedSet.has(a.key))
  const selected = catalog.filter((a) => selectedSet.has(a.key))

  const add = (key) => onChange([...selectedKeys, key])
  const remove = (key) => onChange(selectedKeys.filter((k) => k !== key))

  return (
    <div className="space-y-4">
      <div>
        <span className="text-sm font-semibold text-emerald-100/80">Amenities</span>
        <span className="ml-1 text-xs font-normal text-emerald-100/40">(optional — add what's available at your ground)</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {available.map((amenity) => (
          <button
            key={amenity.key}
            type="button"
            onClick={() => add(amenity.key)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-white/5 px-3.5 py-2 text-sm text-emerald-100/80 transition-colors hover:border-emerald-400/50 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <AmenityIcon name={amenity.icon} className="h-4 w-4" />
            {amenity.name}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div>
          <span className="mb-2 block text-xs font-semibold tracking-wide text-emerald-100/50 uppercase">Selected Amenities</span>
          <div className="flex flex-wrap gap-2">
            {selected.map((amenity) => (
              <span
                key={amenity.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2 text-sm font-semibold text-emerald-100"
              >
                <AmenityIcon name={amenity.icon} className="h-4 w-4" />
                {amenity.name}
                <button type="button" onClick={() => remove(amenity.key)} className="ml-0.5 rounded-full hover:text-white" aria-label={`Remove ${amenity.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
