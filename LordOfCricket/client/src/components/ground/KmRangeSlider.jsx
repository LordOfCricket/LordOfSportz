import { useState } from 'react'
import { MIN_RADIUS_KM, MAX_RADIUS_KM } from '../../models/groundDiscovery.model.js'

// "In Flipkart there is a range selector of prices, I want a range selector
// of kilometers" — a native <input type="range"> rather than a hand-rolled
// pointer-drag widget: it's fully keyboard/touch/screen-reader accessible
// for free, which a custom draggable thumb would have to reimplement.
//
// The label updates live as you drag (onChange fires every tick), but the
// `onCommit` callback — the one that triggers a network refetch — only
// fires on release (mouseup/touchend) or after a keyboard step. Firing a
// refetch on every drag-tick would flood the backend with a request per
// pixel of movement.
// `compact` — the top filter-bar-in-a-row context (GroundsPage): drops the
// min/max endpoint labels and shrinks to a fixed narrow width so the slider
// sits inline with single-line buttons instead of the full-width vertical
// block this component started as.
export default function KmRangeSlider({ value, onCommit, compact = false }) {
  // Seeded once from `value` on mount; after that `localValue` and the
  // parent's `value` never actually diverge — every path that changes
  // `value` (drag release, keyboard step) goes through `commit` below,
  // which sets both to the same number. No effect needed to keep them in
  // sync (nothing else in this app ever changes `value` externally).
  const [localValue, setLocalValue] = useState(value)

  const commit = (raw) => {
    const km = Number(raw)
    setLocalValue(km)
    onCommit(km)
  }

  return (
    <div className={`flex shrink-0 flex-col gap-1 ${compact ? 'w-32' : 'w-full max-w-xs gap-2'}`}>
      <div className={`flex items-center justify-between font-semibold whitespace-nowrap text-loc-muted uppercase ${compact ? 'text-[10px]' : 'text-xs tracking-widest'}`}>
        <span>Radius</span>
        <span className="text-loc-green">{localValue} km</span>
      </div>
      <input
        type="range"
        min={MIN_RADIUS_KM}
        max={MAX_RADIUS_KM}
        step={1}
        value={localValue}
        aria-label="Search radius in kilometers"
        aria-valuetext={`${localValue} kilometers`}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseUp={(e) => commit(e.target.value)}
        onTouchEnd={(e) => commit(e.target.value)}
        onKeyUp={(e) => commit(e.target.value)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-loc-border-soft accent-emerald-500
          [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-emerald-500/40
          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-400"
      />
      {!compact && (
        <div className="flex justify-between text-[11px] text-loc-faint">
          <span>{MIN_RADIUS_KM} km</span>
          <span>{MAX_RADIUS_KM} km</span>
        </div>
      )}
    </div>
  )
}
