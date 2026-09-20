import { useCallback, useEffect, useRef, useState } from 'react'

// The ONE transport primitive every spectator polling
// surface builds on: the detailed live match panel (~3s), the
// /matches LIVE tab (~20s), and the homepage featured match (~30s) all use
// this same hook with a different fetchFn/interval, instead of each owning
// its own setInterval/fetch. When Socket.IO is introduced for a surface, only the
// transport layer (this file, or whatever replaces it) needs to change —
// consuming hooks/components read `{ data, status, lastUpdatedAt, refresh }`
// either way.
//
// Self-rescheduling setTimeout loop (not setInterval) is what makes bounded
// backoff possible: each tick decides its OWN next delay based on whether the
// last attempt succeeded.
const BACKOFF_STEPS_MS = [3000, 5000, 10000, 15000, 30000]

function failingDelay(backoffIndex, normalIntervalMs) {
  return backoffIndex === 0 ? normalIntervalMs : BACKOFF_STEPS_MS[backoffIndex - 1]
}

/**
 * `resetKey` identifies WHICH subject is being polled (e.g. a matchId) —
 * changing it restarts the loop cleanly instead of silently continuing under
 * a stale closure. `shouldStop(data)` (optional) lets a poller permanently
 * halt itself once a fetched response says so (a completed
 * match never keeps polling every 3 seconds forever) without the CALLER
 * needing its own extra state/effect to express that.
 *
 * Every state slot is tagged with the resetKey it belongs to and only
 * exposed when it still matches the CURRENT resetKey (usePublicMatches
 * established this "derived loading" pattern first) — so a
 * subject change never needs a synchronous setState-in-effect reset call,
 * and stale-subject data is never accidentally shown mid-transition.
 */
export function useVisibilityAwarePolling(fetchFn, { intervalMs, enabled = true, resetKey = 'static', shouldStop } = {}) {
  const [state, setState] = useState({ resetKeyOfState: null, data: null, error: null, failing: false, lastUpdatedAt: null })
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  const fetchFnRef = useRef(fetchFn)
  const shouldStopRef = useRef(shouldStop)
  const timerRef = useRef(null)
  const inFlightRef = useRef(false)
  const backoffIndexRef = useRef(0)
  const seqRef = useRef(0)
  const mountedRef = useRef(true)
  const haltedRef = useRef(false)
  const pollRef = useRef(null)

  // Ref writes belong in effects, never directly in the render body — this
  // just keeps each ref pointing at the latest closure/prop.
  useEffect(() => {
    fetchFnRef.current = fetchFn
    shouldStopRef.current = shouldStop
  })

  const poll = useCallback(
    async ({ manual = false } = {}) => {
      // A manual call (explicit user refresh, or a sibling transport's
      // "please resync over HTTP" request — useLiveMatch relies on
      // this) always goes through even while the automatic loop is disabled;
      // it just never reschedules a recurring loop in that case (see the
      // `enabled` check in the `finally` block below).
      if (!enabled && !manual) return
      if (!manual && typeof document !== 'undefined' && document.visibilityState === 'hidden') return // paused while hidden
      if (!manual && typeof navigator !== 'undefined' && !navigator.onLine) return // no point hammering while offline
      if (inFlightRef.current) return // dedup

      inFlightRef.current = true
      const mySeq = ++seqRef.current
      const myResetKey = resetKey

      try {
        const result = await fetchFnRef.current()
        if (!mountedRef.current || mySeq !== seqRef.current) return // stale/out-of-order/unmounted
        setState({ resetKeyOfState: myResetKey, data: result, error: null, failing: false, lastUpdatedAt: Date.now() })
        backoffIndexRef.current = 0
        if (shouldStopRef.current?.(result)) haltedRef.current = true
      } catch (err) {
        if (!mountedRef.current || mySeq !== seqRef.current) return
        setState((prev) => ({ ...prev, resetKeyOfState: myResetKey, error: err, failing: true }))
        backoffIndexRef.current = Math.min(backoffIndexRef.current + 1, BACKOFF_STEPS_MS.length - 1)
      } finally {
        inFlightRef.current = false
        if (mountedRef.current && enabled && !haltedRef.current) {
          const delay = failingDelay(backoffIndexRef.current, intervalMs)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => pollRef.current({ manual: false }), delay)
        }
      }
    },
    [enabled, intervalMs, resetKey]
  )
  useEffect(() => {
    pollRef.current = poll
  })

  // Start/stop/restart the loop whenever `enabled` or `resetKey` changes —
  // only ever CALLS poll() here, never setState directly, so
  // this stays outside react-hooks/set-state-in-effect's concern (poll's own
  // setState calls happen later, inside its async continuation, exactly like
  // the existing useMatchSummary.js#load pattern).
  useEffect(() => {
    mountedRef.current = true
    seqRef.current += 1 // invalidate any still-in-flight request from the previous subject
    backoffIndexRef.current = 0
    haltedRef.current = false
    if (enabled) {
      poll({ manual: true })
    } else if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on enabled/resetKey only; poll is read via the ref-updated closure each call
  }, [enabled, resetKey])

  // Tab visibility: immediate refresh the instant the spectator returns.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') pollRef.current({ manual: true })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // Connectivity: reflect offline immediately, and catch up the instant we're back.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => {
      setOffline(false)
      pollRef.current({ manual: true })
    }
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const refresh = useCallback(() => pollRef.current({ manual: true }), [])

  const isCurrent = state.resetKeyOfState === resetKey
  const data = isCurrent ? state.data : null
  const error = isCurrent ? state.error : null
  const failing = isCurrent ? state.failing : false
  const lastUpdatedAt = isCurrent ? state.lastUpdatedAt : null
  const loading = !isCurrent || (data == null && error == null)

  // connecting: no successful fetch yet for this subject. ok: last attempt
  // succeeded. reconnecting: last attempt failed but we're online. offline:
  // the browser reports no connection at all.
  const status = offline ? 'offline' : loading ? 'connecting' : failing ? 'reconnecting' : 'ok'

  return { data, error, loading, status, lastUpdatedAt, refresh }
}
