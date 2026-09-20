import { useVisibilityAwarePolling } from './useVisibilityAwarePolling.js'
import { getFeaturedIndiaMatch } from '../services/indiaMatch.js'

// Mirrors the server's own CricAPI cache TTL (cricapi.service.js) — polling
// faster than the data can actually change just adds pointless requests.
const INDIA_MATCH_POLL_INTERVAL_MS = 60000

// getFeaturedIndiaMatch() legitimately resolves to `null` on a *successful*
// call (no live or upcoming India match right now) — but
// useVisibilityAwarePolling's `loading` flag is `data == null && error ==
// null`, so a raw null success would look identical to "still loading"
// forever. Wrapping the value in an object keeps `data` truthy once any
// fetch completes, independent of whether a match was found.
async function fetchIndiaMatch() {
  const match = await getFeaturedIndiaMatch()
  return { match }
}

export function useIndiaMatch() {
  const polling = useVisibilityAwarePolling(fetchIndiaMatch, { intervalMs: INDIA_MATCH_POLL_INTERVAL_MS, enabled: true })
  return {
    match: polling.data?.match ?? null,
    loading: polling.loading,
    error: polling.loading ? null : polling.error ? "Couldn't load India match info." : null,
  }
}
