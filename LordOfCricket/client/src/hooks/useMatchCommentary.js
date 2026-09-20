import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { socketUrl } from '../services/socket.js'
import { fetchCommentaryPage } from '../services/commentaryApi.js'

const PAGE_LIMIT = 30

function dedupePrepend(existing, incoming) {
  const seen = new Set(existing.map((e) => e.id))
  const fresh = incoming.filter((e) => !seen.has(e.id))
  return fresh.length ? [...fresh, ...existing] : existing
}

/**
 * Spectator commentary transport. Owns its own Socket.IO connection
 * (same one-connection-per-hook-mount convention as useSocketMatchTransport,
 * joined to the SAME match:{matchId} room — no second room) plus the
 * initial/paginated HTTP fetch. `append` messages merge straight into the
 * list; a `resync` message (a correction may have changed many entries at
 * once), a reconnect (never assume missed events
 * replay), or an innings transition all trigger a fresh HTTP refetch of the
 * first page rather than trying to patch the list in place. No component
 * using this hook ever calls socket.on(...) directly.
 *
 * @param {number|string} matchId
 * @param {{ inningsId?: number, enabled?: boolean }} [opts] - `inningsId`
 *   pins the view to one specific innings (e.g. browsing a finished first
 *   innings while the second is live); omitted, it tracks whichever innings
 *   the server currently considers current.
 */
export function useMatchCommentary(matchId, { inningsId, enabled = true } = {}) {
  const resetKey = `${matchId ?? ''}:${inningsId ?? ''}`
  const [state, setState] = useState({ resetKeyOfState: null, entries: [], inningsId: null, inningsVersion: null, hasMore: false, nextBefore: null, error: null })
  const [connection, setConnection] = useState({ resetKeyOfConnection: null, connected: false })

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    if (!enabled || !matchId) return undefined
    let cancelled = false

    const refetchFirstPage = () => {
      fetchCommentaryPage(matchId, { inningsId, limit: PAGE_LIMIT })
        .then((page) => {
          if (cancelled) return
          setState({
            resetKeyOfState: resetKey,
            entries: page.entries,
            inningsId: page.inningsId,
            inningsVersion: page.inningsVersion,
            hasMore: page.pagination.hasMore,
            nextBefore: page.pagination.nextBefore,
            error: null,
          })
        })
        .catch((err) => {
          if (cancelled) return
          setState((prev) => ({ ...prev, resetKeyOfState: resetKey, error: err }))
        })
    }

    refetchFirstPage()

    const socket = io(socketUrl, { transports: ['websocket', 'polling'] })
    let hasConnectedBefore = false

    socket.on('connect', () => {
      socket.emit('join-match', { matchId: Number(matchId) })
      setConnection({ resetKeyOfConnection: resetKey, connected: true })
      if (hasConnectedBefore) refetchFirstPage() // reconnect — resync rather than trust missed events
      hasConnectedBefore = true
    })
    socket.on('disconnect', () => setConnection({ resetKeyOfConnection: resetKey, connected: false }))
    socket.on('connect_error', () => setConnection({ resetKeyOfConnection: resetKey, connected: false }))

    socket.on('match:commentary', (payload) => {
      const current = stateRef.current
      const pinned = inningsId != null
      if (pinned && payload.inningsId !== Number(inningsId)) return
      if (!pinned && current.inningsId != null && payload.inningsId !== current.inningsId) {
        refetchFirstPage() // innings transition — the view was tracking the previous innings
        return
      }
      if (payload.mode === 'resync') {
        refetchFirstPage()
      } else if (payload.mode === 'append' && payload.entries.length) {
        setState((prev) => (prev.resetKeyOfState === resetKey ? { ...prev, entries: dedupePrepend(prev.entries, payload.entries), inningsVersion: payload.inningsVersion } : prev))
      }
    })

    return () => {
      cancelled = true
      socket.emit('leave-match', { matchId: Number(matchId) })
      socket.disconnect()
    }
  }, [matchId, inningsId, enabled, resetKey])

  const loadMore = useCallback(async () => {
    const current = stateRef.current
    if (!matchId || !current.hasMore || current.nextBefore == null) return
    try {
      const page = await fetchCommentaryPage(matchId, { inningsId: current.inningsId, before: current.nextBefore, limit: PAGE_LIMIT })
      setState((prev) =>
        prev.resetKeyOfState === resetKey ? { ...prev, entries: [...prev.entries, ...page.entries], hasMore: page.pagination.hasMore, nextBefore: page.pagination.nextBefore } : prev
      )
    } catch {
      // Leave state as-is; the "Load older" control simply remains available to retry.
    }
  }, [matchId, resetKey])

  const isCurrent = state.resetKeyOfState === resetKey
  return {
    entries: isCurrent ? state.entries : [],
    loading: !isCurrent && state.error == null,
    error: isCurrent ? state.error : null,
    hasMore: isCurrent ? state.hasMore : false,
    loadMore,
    connected: connection.resetKeyOfConnection === resetKey ? connection.connected : false,
    inningsId: isCurrent ? state.inningsId : null,
    inningsVersion: isCurrent ? state.inningsVersion : null,
  }
}
