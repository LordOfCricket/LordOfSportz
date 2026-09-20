import { useEffect, useRef, useState } from 'react'
import { socketService, CommentaryListener, ErrorListener } from '../services/socket'
import { getMatchCommentary } from '../services/matchApi'

const PAGE_LIMIT = 30

interface CommentaryEntry {
  id: number
  type: string
  ballLabel: string
  text: string
  tags: string[]
  score: { runs: number; wickets: number } | null
  deliveryId: number | null
  eventId: number | null
  sequence: number
}

interface UseSocketCommentaryResult {
  entries: CommentaryEntry[]
  inningsId: number | null
  inningsVersion: number | null
  hasMore: boolean
  connected: boolean
  error: Error | null
  loading: boolean
}

function dedupePrepend(existing: CommentaryEntry[], incoming: CommentaryEntry[]): CommentaryEntry[] {
  const seen = new Set(existing.map((e) => e.id))
  const fresh = incoming.filter((e) => !seen.has(e.id))
  return fresh.length ? [...fresh, ...existing] : existing
}

/**
 * Phase 3B — Subscribe to real-time commentary updates.
 * Follows web app pattern: HTTP initial fetch + Socket.IO event stream.
 * Mirrors useMatchCommentary from web app.
 *
 * @param matchId — the match to subscribe to
 * @param options — inningsId (pin to specific innings), enabled
 */
export function useSocketCommentary(
  matchId: number | null,
  { inningsId, enabled = true } = {} as { inningsId?: number; enabled?: boolean }
): UseSocketCommentaryResult {
  const resetKey = `${matchId ?? ''}:${inningsId ?? ''}`
  const [state, setState] = useState<UseSocketCommentaryResult>({
    entries: [],
    inningsId: null,
    inningsVersion: null,
    hasMore: false,
    connected: false,
    error: null,
    loading: true,
  })

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  useEffect(() => {
    if (!enabled || !matchId) {
      setState({
        entries: [],
        inningsId: null,
        inningsVersion: null,
        hasMore: false,
        connected: false,
        error: null,
        loading: false,
      })
      return
    }

    let cancelled = false

    const refetchFirstPage = async () => {
      try {
        const page = await getMatchCommentary(matchId, inningsId, PAGE_LIMIT)

        if (cancelled) return

        setState({
          entries: page.entries,
          inningsId: page.inningsId,
          inningsVersion: page.inningsVersion,
          hasMore: page.pagination.hasMore,
          connected: socketService.isConnected(),
          error: null,
          loading: false,
        })
      } catch (err) {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err : new Error('Failed to fetch commentary'),
          loading: false,
        }))
      }
    }

    // Initial load
    refetchFirstPage()

    const onCommentary: CommentaryListener = (payload) => {
      if (cancelled) return

      const current = stateRef.current
      const pinned = inningsId != null

      // If pinned to specific innings, ignore other innings
      if (pinned && payload.inningsId !== Number(inningsId)) return

      // If tracking current innings and innings changed, refetch
      if (!pinned && current.inningsId != null && payload.inningsId !== current.inningsId) {
        refetchFirstPage()
        return
      }

      // Handle resync mode (correction/undo)
      if (payload.mode === 'resync') {
        refetchFirstPage()
        return
      }

      // Handle append mode (new entries)
      if (payload.mode === 'append' && payload.entries.length > 0) {
        setState((prev) => ({
          ...prev,
          entries: dedupePrepend(prev.entries, payload.entries),
          inningsVersion: payload.inningsVersion,
        }))
      }
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
        onCommentary,
        onError,
      })
      .then(() => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            connected: true,
          }))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: err instanceof Error ? err : new Error('Failed to connect'),
          }))
        }
      })

    return () => {
      cancelled = true
      socketService.unsubscribeFromMatch(matchId)
    }
  }, [matchId, inningsId, enabled, resetKey])

  return state
}
