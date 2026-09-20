import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { AxiosError } from 'axios'
import { socketService } from '../services/socket'
import * as scoringApi from '../services/scoringApi'
import type { InningsState, InningsTimeline, WagonWheelShotRow, MatchPlayerRow, CorrectionRow } from '../services/scoringApi'
import { getMatchSummary } from '../services/matchApi'
import type { MatchSummary } from '../types'

// Mobile port of client/src/hooks/useRealScorer.js. NEVER computes cricket
// state locally — it only calls scoringApi and stores exactly what the
// server returns. Server is the single source of truth. A match:state socket
// event (or the focus-gated poll fallback) triggers a silent refresh when
// the innings version advances.

const POLL_MS = 10000

function apiError(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    // requireMatchScorer 403s return { error }, not { message }
    return err.response?.data?.error || err.response?.data?.message || err.message || fallback
  }
  return fallback
}

export interface MobileScorer {
  match: MatchSummary | null
  matchPlayers: MatchPlayerRow[]
  playersById: Map<number, MatchPlayerRow>
  state: InningsState | null
  timeline: InningsTimeline
  wagonWheelShots: WagonWheelShotRow[]
  corrections: CorrectionRow[]
  loading: boolean
  loadError: string
  actionError: string
  conflictNotice: string
  pending: boolean
  connected: boolean
  refresh: () => Promise<void>
  recordDelivery: (input: scoringApi.DeliveryInput, bowlerMatchPlayerId: number) => Promise<void>
  recordEvent: (eventType: string, payload?: Record<string, unknown>) => Promise<void>
  selectNextBatsman: (end: 'strikerEnd' | 'nonStrikerEnd', matchPlayerId: number) => Promise<void>
  previewCorrection: (targetId: number, patch: Record<string, unknown>) => Promise<{ diff?: unknown; projected?: unknown; message?: string }>
  applyCorrection: (targetId: number, patch: Record<string, unknown>, reasonCode: string, note?: string) => Promise<void>
  undoDelivery: (deliveryId: number) => Promise<void>
  clearActionError: () => void
}

export function useMobileScorer(matchId: number, inningsId: number | null): MobileScorer {
  const [match, setMatch] = useState<MatchSummary | null>(null)
  const [matchPlayers, setMatchPlayers] = useState<MatchPlayerRow[]>([])
  const [state, setState] = useState<InningsState | null>(null)
  const [timeline, setTimeline] = useState<InningsTimeline>({ timeline: [], byOver: [] })
  const [wagonWheelShots, setWagonWheelShots] = useState<WagonWheelShotRow[]>([])
  const [corrections, setCorrections] = useState<CorrectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conflictNotice, setConflictNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [connected, setConnected] = useState(false)

  const stateRef = useRef<InningsState | null>(null)
  const inFlightRef = useRef(false)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const playersById = new Map(matchPlayers.map((mp) => [mp.id, mp]))

  const refresh = useCallback(async () => {
    if (inningsId == null) {
      const m = await getMatchSummary(matchId)
      setMatch(m)
      return
    }
    const [nextState, nextTimeline, nextShots, nextCorrections, nextMatch] = await Promise.all([
      scoringApi.getInningsState(inningsId),
      scoringApi.getInningsTimeline(inningsId),
      scoringApi.getWagonWheel(inningsId),
      scoringApi.getCorrectionHistory(inningsId).catch(() => [] as CorrectionRow[]),
      getMatchSummary(matchId),
    ])
    setState(nextState)
    setTimeline(nextTimeline)
    setWagonWheelShots(nextShots)
    setCorrections(nextCorrections)
    setMatch(nextMatch)
  }, [matchId, inningsId])

  // Initial load — all setState happens asynchronously inside the IIFE so
  // the effect body itself stays side-effect-free (no cascading renders).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const mps = await scoringApi.listMatchPlayers(matchId).catch(() => [] as MatchPlayerRow[])
        if (cancelled) return
        setMatchPlayers(mps)
        await refresh()
      } catch (err) {
        if (!cancelled) setLoadError(apiError(err, 'Unable to load this match.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, inningsId])

  // Realtime — a single onState listener on the shared match room. Silent
  // refresh only when the live innings version actually advanced (mirrors
  // the web MatchSummaryPage E-2 fix). Never mounts a second listener.
  useEffect(() => {
    if (!Number.isFinite(matchId)) return
    let active = true
    socketService
      .subscribeToMatch(matchId, {
        onState: (payload) => {
          if (!active) return
          setConnected(true)
          const ci = payload.currentInnings
          const cur = stateRef.current
          if (ci && cur && ci.id === cur.innings.id && ci.version > cur.innings.version) {
            refresh().catch(() => {})
          } else if (!cur || (ci && ci.id !== cur?.innings.id)) {
            refresh().catch(() => {})
          }
        },
        onError: () => setConnected(false),
      })
      .then(() => {
        if (active) setConnected(socketService.isConnected())
      })
      .catch(() => setConnected(false))
    return () => {
      active = false
      socketService.unsubscribeFromMatch(matchId)
    }
  }, [matchId, refresh])

  // Focus/AppState-gated poll fallback — only runs while the app is
  // foregrounded. Cleared on unmount, so a hidden screen never polls.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const tick = () => {
      if (AppState.currentState === 'active' && !inFlightRef.current && !pending) {
        inFlightRef.current = true
        refresh()
          .catch(() => {})
          .finally(() => {
            inFlightRef.current = false
          })
      }
    }
    timer = setInterval(tick, POLL_MS)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick()
    })
    return () => {
      if (timer) clearInterval(timer)
      sub.remove()
    }
  }, [refresh, pending])

  const withWrite = useCallback(
    async (action: () => Promise<void>) => {
      if (pending) return
      setPending(true)
      setActionError('')
      try {
        await action()
        setConflictNotice('')
      } catch (err) {
        const code = err instanceof AxiosError ? err.response?.data?.code : undefined
        if (code === 'VERSION_CONFLICT') {
          setConflictNotice('The score changed elsewhere. Latest state reloaded.')
          await refresh().catch(() => {})
        } else {
          setActionError(apiError(err, 'That action was not recorded. Try again.'))
        }
      } finally {
        setPending(false)
      }
    },
    [pending, refresh],
  )

  const recordDelivery = useCallback(
    (input: scoringApi.DeliveryInput, bowlerMatchPlayerId: number) =>
      withWrite(async () => {
        if (inningsId == null || !stateRef.current) return
        await scoringApi.recordDelivery(inningsId, {
          expectedVersion: stateRef.current.innings.version,
          clientActionId: scoringApi.generateClientActionId(),
          bowlerMatchPlayerId,
          ...input,
        })
        await refresh()
      }),
    [withWrite, inningsId, refresh],
  )

  const recordEvent = useCallback(
    (eventType: string, payload: Record<string, unknown> = {}) =>
      withWrite(async () => {
        if (inningsId == null || !stateRef.current) return
        await scoringApi.recordEvent(inningsId, {
          expectedVersion: stateRef.current.innings.version,
          clientActionId: scoringApi.generateClientActionId(),
          eventType,
          payload,
        })
        await refresh()
      }),
    [withWrite, inningsId, refresh],
  )

  const selectNextBatsman = useCallback(
    (end: 'strikerEnd' | 'nonStrikerEnd', matchPlayerId: number) => recordEvent('batsman-in', { end, matchPlayerId }),
    [recordEvent],
  )

  const previewCorrection = useCallback(
    (targetId: number, patch: Record<string, unknown>) =>
      scoringApi.previewCorrection(inningsId as number, { targetType: 'delivery', targetId, patch }),
    [inningsId],
  )

  const applyCorrection = useCallback(
    (targetId: number, patch: Record<string, unknown>, reasonCode: string, note?: string) =>
      withWrite(async () => {
        if (inningsId == null || !stateRef.current) return
        await scoringApi.applyCorrection(inningsId, {
          targetType: 'delivery',
          targetId,
          patch,
          reasonCode,
          note,
          expectedVersion: stateRef.current.innings.version,
          clientActionId: scoringApi.generateClientActionId(),
        })
        await refresh()
      }),
    [withWrite, inningsId, refresh],
  )

  const undoDelivery = useCallback(
    (deliveryId: number) => applyCorrection(deliveryId, { voided: true }, 'UNDO'),
    [applyCorrection],
  )

  return {
    match,
    matchPlayers,
    playersById,
    state,
    timeline,
    wagonWheelShots,
    corrections,
    loading,
    loadError,
    actionError,
    conflictNotice,
    pending,
    connected,
    refresh,
    recordDelivery,
    recordEvent,
    selectNextBatsman,
    previewCorrection,
    applyCorrection,
    undoDelivery,
    clearActionError: () => setActionError(''),
  }
}
