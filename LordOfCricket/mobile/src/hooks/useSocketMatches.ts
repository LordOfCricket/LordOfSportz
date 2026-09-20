import { useEffect, useState } from 'react'
import { socketService, MatchStateListener, ErrorListener } from '../services/socket'
import { SocketMatchStatePayload } from '../types'

interface UseLiveMatchResult {
  data: SocketMatchStatePayload | null
  connected: boolean
  error: Error | null
  lastUpdatedAt: number | null
}

const INACTIVE_RESULT: UseLiveMatchResult = {
  data: null,
  connected: false,
  error: null,
  lastUpdatedAt: null,
}

/**
 * Phase 3B — Subscribe to real-time match state updates.
 * Follows web app pattern: one connection per hook mount, state tagged with matchId.
 * Mirrors useSocketMatchTransport from web app.
 */
export function useLiveMatch(matchId: number | null, { enabled = true } = {}): UseLiveMatchResult {
  const [state, setState] = useState<UseLiveMatchResult>({
    data: null,
    connected: false,
    error: null,
    lastUpdatedAt: null,
  })

  useEffect(() => {
    // No subscription while inactive — the hook returns INACTIVE_RESULT
    // directly below, so nothing needs to be written to state here.
    if (!enabled || !matchId) return

    let cancelled = false

    const onState: MatchStateListener = (payload) => {
      if (cancelled) return
      setState({
        data: payload,
        connected: true,
        error: null,
        lastUpdatedAt: Date.now(),
      })
    }

    const onError: ErrorListener = (error) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        error: new Error(error.message),
      }))
    }

    socketService
      .subscribeToMatch(matchId, {
        onState,
        onError,
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            data: null,
            connected: false,
            error: err instanceof Error ? err : new Error('Failed to connect'),
            lastUpdatedAt: null,
          })
        }
      })

    // Set initial connected state based on socket connection status
    setState((prev) => ({
      ...prev,
      connected: socketService.isConnected(),
    }))

    return () => {
      cancelled = true
      socketService.unsubscribeFromMatch(matchId)
    }
  }, [matchId, enabled])

  if (!enabled || !matchId) return INACTIVE_RESULT
  return state
}
