import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// A subtle connection/freshness indicator.
// The "Updated Xs ago" text ticks locally every second (presentation-only,
// never refetches) and deliberately has NO aria-live region: an
// aria-live counter that changes every second would spam a screen reader
// every tick, which this explicitly avoids.
const STALE_THRESHOLD_MS = 15000 // ~5x the 3s poll interval, documented

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

export default function LiveStatusBar({ connectionStatus, lastUpdatedAt, onRefresh }) {
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Deliberately impure: a presentation-only "time ago" ticker that
  // re-reads the clock every second via the interval above — never used as
  // cricket truth, so React re-running this on an extra render is harmless.
  // eslint-disable-next-line react-hooks/purity
  const elapsedMs = lastUpdatedAt ? Date.now() - lastUpdatedAt : null
  const isStale = connectionStatus === 'ok' && elapsedMs != null && elapsedMs > STALE_THRESHOLD_MS

  let message
  if (connectionStatus === 'offline') message = "You're offline. Showing the last known score."
  else if (connectionStatus === 'reconnecting') message = 'Connection interrupted — trying to reconnect...'
  else if (isStale) message = 'Score may be delayed.'
  else if (elapsedMs != null) message = `Updated ${formatElapsed(elapsedMs)}`
  else message = 'Connecting...'

  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-slate-400">
      <span>{message}</span>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh live score"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-semibold text-slate-300 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        <RefreshCw className="h-3 w-3" />
        Refresh
      </button>
    </div>
  )
}
