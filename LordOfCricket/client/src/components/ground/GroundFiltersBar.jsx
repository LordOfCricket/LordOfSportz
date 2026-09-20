import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'

// A popover, not permanent chrome — "clean filtering controls... use a
// filter drawer/popover so the interface remains premium and uncluttered."
// Facilities checkboxes are built from the UNION of real `amenities` names
// actually present across the current result set — never a hardcoded
// facility list, since the schema has no canonical facility enum.
//
// No Sort control here (deliberate, not an oversight): nearby results are
// already server-sorted nearest-first and city results are already
// server-sorted alphabetically — there's no second real ordering to offer
// for either mode today (no rating/price/popularity data exists), so a
// "Sort" dropdown would just present one option that's already the
// default. Revisit once a second real orderable field exists.
export default function GroundFiltersBar({ grounds, selectedFacilities, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const allFacilities = [...new Set(grounds.flatMap((g) => g.amenities || []))].sort()

  if (allFacilities.length === 0) return null

  const toggle = (facility) => {
    onChange(selectedFacilities.includes(facility) ? selectedFacilities.filter((f) => f !== facility) : [...selectedFacilities, facility])
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
          selectedFacilities.length > 0 ? 'border-loc-green bg-loc-mint text-loc-navy' : 'border-loc-border text-loc-muted hover:text-loc-navy'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Facilities
        {selectedFacilities.length > 0 && <span className="rounded-full bg-loc-green px-1.5 text-xs text-loc-navy">{selectedFacilities.length}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-loc-border bg-loc-surface p-3 shadow-loc">
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {allFacilities.map((facility) => (
              <label key={facility} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-loc-muted hover:bg-loc-mint">
                <input
                  type="checkbox"
                  checked={selectedFacilities.includes(facility)}
                  onChange={() => toggle(facility)}
                  className="h-4 w-4 rounded border-loc-green bg-transparent text-loc-green focus:ring-loc-green/40"
                />
                {facility}
              </label>
            ))}
          </div>
          {selectedFacilities.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-loc-green hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
