import { useVisibilityAwarePolling } from './useVisibilityAwarePolling.js'
import { fetchHomeDiscovery } from '../services/publicMatchApi.js'

// The homepage refreshes every ~30s while
// visible, paused when hidden — via the same shared transport every other
// spectator polling surface uses, not a bespoke interval.
const HOME_POLL_INTERVAL_MS = 30000

/** Homepage match-discovery read model — one bounded request for
 * featured live + upcoming preview + recent results preview. Failure here
 * must not take down the rest of the homepage — this hook/section is
 * self-contained. */
export function useHomeDiscovery() {
  const polling = useVisibilityAwarePolling(fetchHomeDiscovery, { intervalMs: HOME_POLL_INTERVAL_MS, enabled: true })
  return {
    data: polling.data,
    loading: polling.loading,
    error: polling.loading ? null : polling.error ? polling.error.response?.data?.message || "Couldn't load match activity." : null,
    retry: polling.refresh,
  }
}
