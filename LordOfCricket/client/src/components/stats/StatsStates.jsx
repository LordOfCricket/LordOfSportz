import { BarChart3, AlertCircle } from 'lucide-react'

// Shared loading/error/empty widgets for every career-statistics surface
// (Dashboard Career Overview, Profile tabs). Rule: never show a "0"
// or "0.00" while data is still loading or failed to load — those are
// meaningfully different from an actual zero-value career statistic.
//
// `light` opts into the LOC light theme (passed by migrated public pages);
// default keeps the legacy dark styling for the ~29 dashboard consumers.

export function StatsLoadingGrid({ tiles = 4, light = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status" aria-label="Loading statistics">
      {Array.from({ length: tiles }).map((_, i) => (
        <div
          key={i}
          className={`h-20 animate-pulse rounded-2xl border ${light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'}`}
        />
      ))}
    </div>
  )
}

export function StatsErrorState({ message, onRetry, light = false }) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center ${
        light ? 'border-red-200 bg-red-50' : 'border-red-400/20 bg-red-500/5'
      }`}
    >
      <AlertCircle className={`h-8 w-8 ${light ? 'text-red-500' : 'text-red-300'}`} />
      <p className={`text-sm ${light ? 'text-red-700' : 'text-red-100'}`}>{message || "Couldn't load career statistics."}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
            light ? 'border-red-300 text-red-700 hover:bg-red-100' : 'border-red-300/30 text-red-100 hover:bg-red-500/10'
          }`}
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function StatsEmptyState({
  label = 'Your cricket statistics',
  suffix = ' will appear after your first LOC match is finalized.',
  light = false,
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center ${
        light ? 'border-loc-border bg-loc-mint' : 'border-white/10 bg-white/5'
      }`}
    >
      <BarChart3 className={`h-8 w-8 ${light ? 'text-loc-faint' : 'text-slate-500'}`} />
      <p className={`text-sm ${light ? 'text-loc-muted' : 'text-slate-300'}`}>
        {label}
        {suffix}
      </p>
    </div>
  )
}
