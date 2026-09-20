import { useCallback } from 'react'
import { useVisibilityAwarePolling } from './useVisibilityAwarePolling.js'
import { useSocketMatchTransport } from './useSocketMatchTransport.js'
import { fetchLiveMatchState } from '../services/liveMatchApi.js'

// Recommended cadence: a fast 3s tick while the
// match is actively live (including innings break — cheap regardless of
// status, see liveMatch.service.js), a slow 30s lifecycle check while the
// match is merely upcoming (detect the upcoming -> live
// transition without aggressive polling), and no polling at all once the
// match has reached a terminal state.
const LIVE_INTERVAL_MS = 3000
const UPCOMING_LIFECYCLE_INTERVAL_MS = 30000

const TERMINAL_STATUSES = new Set(['completed', 'finalized'])
const isTerminalResponse = (data) => TERMINAL_STATUSES.has(data.match.status)

/** True if `candidate` is at least as fresh as `current` — the ONE place
 * realtime state is compared across two independent transports
 * (socket + HTTP polling fallback). Keyed on (inningsId, version), exactly
 * the composite identity this comparison needs: a plain global version
 * comparison would misfire across an innings 1 -> innings 2 transition,
 * where version legitimately resets. Neither transport's data is ever
 * trusted merely because it arrived "later" in wall-clock time — only
 * because it is verifiably newer. */
function isNewer(candidate, current) {
  if (!candidate) return false
  if (!current) return true
  const candidateInnings = candidate.currentInnings
  const currentInnings = current.currentInnings
  if (!candidateInnings) return !currentInnings // both innings-less (e.g. still upcoming) counts as fresh; regressing to null does not
  if (!currentInnings) return true
  if (candidateInnings.id !== currentInnings.id) return true // an innings transition always wins, regardless of version numbers
  return candidateInnings.version >= currentInnings.version
}

/**
 * Spectator transport: Socket.IO is primary, HTTP polling is the
 * resilience fallback — never both running aggressively at once.
 * While the socket is connected, polling is disabled entirely (no redundant
 * 3s HTTP calls); the moment the socket disconnects, polling re-arms
 * immediately and keeps the spectator's view fresh (at most one polling
 * interval stale) for the whole outage — a continuous resync, not a single
 * one-shot fetch exactly at reconnect (solved more
 * simply: there is never a "missed events" window longer than one poll tick).
 *
 * `useLiveMatch`/`LiveMatchPanel` and everything under `components/live-match/`
 * still only see `{ liveState, loading, connectionStatus, lastUpdatedAt,
 * refresh, isPolling }` — no component reaches into
 * `socket.on(...)` directly.
 */
export function useLiveMatch(matchId, { initialStatus } = {}) {
  const isUpcomingSoFar = initialStatus === 'upcoming'
  const intervalMs = isUpcomingSoFar ? UPCOMING_LIFECYCLE_INTERVAL_MS : LIVE_INTERVAL_MS
  const initiallyTerminal = initialStatus != null && TERMINAL_STATUSES.has(initialStatus)
  const enabled = Boolean(matchId) && initialStatus != null && !initiallyTerminal

  const socket = useSocketMatchTransport(matchId, { enabled })

  const fetchFn = useCallback(() => fetchLiveMatchState(matchId), [matchId])
  const polling = useVisibilityAwarePolling(fetchFn, {
    intervalMs,
    enabled: enabled && !socket.connected,
    resetKey: matchId,
    shouldStop: isTerminalResponse,
  })

  const liveState = isNewer(socket.data, polling.data) ? socket.data : polling.data
  const lastUpdatedAt = liveState === socket.data ? socket.lastUpdatedAt : polling.lastUpdatedAt
  const loading = polling.loading && !socket.data
  // Browser-level offline is authoritative regardless of what the socket
  // currently believes: a dead network can leave a socket "connected" for
  // several seconds past the last successful heartbeat (Engine.IO detects a
  // stale connection lazily), but navigator.onLine flips immediately —
  // exactly the polling transport's existing offline detection.
  const connectionStatus = polling.status === 'offline' ? 'offline' : socket.connected ? 'ok' : polling.status
  const isNowTerminal = liveState ? isTerminalResponse(liveState) : false

  return {
    liveState,
    loading,
    connectionStatus,
    lastUpdatedAt,
    refresh: polling.refresh, // always available — bypasses polling's own enabled gate for manual/cross-transport resync
    isPolling: enabled && !isNowTerminal,
  }
}
