import { useCallback } from 'react'
import { useVisibilityAwarePolling } from './useVisibilityAwarePolling.js'
import { fetchPublicMatches } from '../services/publicMatchApi.js'

// A poller with no real repeat need (every caller except the LIVE tab) still
// gets ONE immediate fetch per param change from the shared transport below —
// "no polling" is just "the next scheduled tick is so far away it never
// practically fires before the component's resetKey changes again."
const NO_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * The public match list, now built on the one
 * shared visibility-aware polling transport instead of its own
 * bespoke fetch effect. `pollIntervalMs` is optional — omitted, this behaves
 * exactly as it did before (one fetch per param change, no auto-refresh).
 * Passed (the /matches LIVE tab), it auto-refreshes on that
 * cadence while the tab is visible, pausing when hidden, reusing the exact
 * same request-race/backoff/offline handling every other spectator polling
 * surface gets for free.
 */
export function usePublicMatches({ category, limit, offset, pollIntervalMs } = {}) {
  const fetchFn = useCallback(() => fetchPublicMatches({ category, limit, offset }), [category, limit, offset])
  const resetKey = `${category}:${limit}:${offset}`
  const polling = useVisibilityAwarePolling(fetchFn, { intervalMs: pollIntervalMs ?? NO_POLL_INTERVAL_MS, enabled: true, resetKey })

  return {
    result: polling.data,
    loading: polling.loading,
    error: polling.loading ? null : polling.error ? polling.error.response?.data?.message || "Couldn't load matches." : null,
    retry: polling.refresh,
  }
}
