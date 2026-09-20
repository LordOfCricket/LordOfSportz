import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

// A real browser-level offline state (no network at
// all) previously looked identical to a slow/failed API call: whatever
// generic fallback message the hook that happened to be loading showed.
// This adds one global, unmissable signal for the specific "you have no
// network" case, distinct from a real server/API error — no service worker,
// no offline caching, no new architecture, just `navigator.onLine` and the
// two DOM events every browser already fires.
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950"
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      You're offline — check your connection. Nothing new will load until it's back.
    </div>
  )
}
