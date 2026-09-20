import { useCallback, useEffect, useState } from 'react'
import * as scoringApi from '../services/scoringApi.js'
import { fetchMatch } from '../services/matchApi.js'

// Backend-authoritative real scorer state. This hook NEVER computes cricket
// state itself (strike rotation, over completion, wicket effects, ...) — it
// only calls scoringApi.js and stores exactly what the server returns. See
// The server is the only source of truth for official
// matches (the practice /testing sandbox is the one place a client engine is
// still allowed to own that logic).
export function useRealScorer(matchId, inningsId, initialOpeningBowlerId) {
  const [match, setMatch] = useState(null)
  const [matchPlayers, setMatchPlayers] = useState([])
  const [state, setState] = useState(null) // serializeState() shape from GET /innings/:id/state
  const [timeline, setTimeline] = useState({ timeline: [], byOver: [] })
  const [wagonWheelShots, setWagonWheelShots] = useState([])
  const [corrections, setCorrections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conflictNotice, setConflictNotice] = useState('')
  const [pending, setPending] = useState(false)
  // Bowler selection is tracked as "chosen id, FOR which
  // over" rather than just an id, and re-derived from authoritative state on
  // every load/refresh — never assumed from the URL alone. Opening over (0)
  // is seeded from the setup flow's URL param; every other over is either
  // resolved unambiguously (mid-over resume: only one bowler could have
  // bowled the balls already on record) or genuinely requires the scorer to
  // pick, which needsBowlerSelection below surfaces.
  const [pendingBowlerId, setPendingBowlerId] = useState(initialOpeningBowlerId ? Number(initialOpeningBowlerId) : null)
  const [pendingBowlerOverNumber, setPendingBowlerOverNumber] = useState(initialOpeningBowlerId ? 0 : null)

  const playersById = new Map(matchPlayers.map((mp) => [mp.id, mp]))

  // Adjust state during render (not in an Effect), per
  // https://react.dev/learn/you-might-not-need-an-effect — resolves the
  // bowler for the current over the instant `state` changes, without an
  // extra render pass. Mid-over (including a fresh page load/resume) is
  // unambiguous: only one bowler could have bowled the balls already on
  // record. At an over boundary with nothing chosen yet, this intentionally
  // does nothing, leaving needsBowlerSelection true so the scorer is prompted.
  if (state && pendingBowlerOverNumber !== state.score.overNumber && state.score.ballInOver > 0 && state.bowler) {
    setPendingBowlerId(state.bowler)
    setPendingBowlerOverNumber(state.score.overNumber)
  }

  const needsBowlerSelection = Boolean(state) && !state.isAllOut && !state.isOversComplete && pendingBowlerOverNumber !== state?.score?.overNumber

  const refresh = useCallback(async () => {
    // No innings to score yet (direct/stale link to this URL before toss/
    // setup picked one) — the page-level redirect to /matches/:id/setup
    // (RealScorerPage, gated on `match`) is what actually handles this,
    // but it can only fire once `match` itself has loaded. Skip the
    // innings-scoped calls entirely rather than asking the server for
    // `/innings/null/*` (server-side 500s, not the 4xx a bad param should
    // be) just to feed state nothing will render.
    if (!inningsId) {
      const nextMatch = await fetchMatch(matchId)
      setMatch(nextMatch)
      return null
    }
    const [nextState, nextTimeline, nextShots, nextCorrections, nextMatch] = await Promise.all([
      scoringApi.getInningsState(inningsId),
      scoringApi.getInningsTimeline(inningsId),
      scoringApi.getWagonWheel(inningsId),
      scoringApi.getCorrectionHistory(inningsId),
      // Cheap single-row fetch, refreshed after every write — without this,
      // `match` stays whatever it was at page load, so a delivery that
      // actually decides the match (target reached / all out / overs
      // complete on the second innings) could never be reflected in
      // match.status/result_type/winner_team_id on this page.
      fetchMatch(matchId),
    ])
    setState(nextState)
    setTimeline(nextTimeline)
    setWagonWheelShots(nextShots)
    setCorrections(nextCorrections)
    setMatch(nextMatch)
    return nextState
  }, [inningsId, matchId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [m, mps] = await Promise.all([fetchMatch(matchId), scoringApi.listMatchPlayers(matchId)])
        if (cancelled) return
        setMatch(m)
        setMatchPlayers(mps)
        await refresh()
      } catch (err) {
        // Auth-middleware 403s (requireMatchScorer) return {error}, not
        // {message} — checked first so a non-assigned umpire sees the real
        // reason ("You are not assigned to umpire this match.") instead of
        // a generic fallback (U4/U3.1: handle authorization failure
        // gracefully, not as a broken/blank state).
        if (!cancelled) setLoadError(err.response?.data?.error || err.response?.data?.message || 'Unable to load this match.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, inningsId])

  const withWriteHandling = useCallback(
    async (action) => {
      setPending(true)
      setActionError('')
      try {
        await action()
        setConflictNotice('')
      } catch (err) {
        if (err.response?.data?.code === 'VERSION_CONFLICT') {
          setConflictNotice('The score changed on another device. Latest state has been loaded.')
          await refresh().catch(() => {})
        } else {
          setActionError(err.response?.data?.error || err.response?.data?.message || 'That action was not recorded. Please try again.')
        }
      } finally {
        setPending(false)
      }
    },
    [refresh]
  )

  const recordDelivery = useCallback(
    (input) =>
      withWriteHandling(async () => {
        const clientActionId = scoringApi.generateClientActionId()
        await scoringApi.recordDelivery(inningsId, {
          expectedVersion: state.innings.version,
          clientActionId,
          bowlerMatchPlayerId: pendingBowlerId,
          ...input,
        })
        await refresh()
      }),
    [withWriteHandling, inningsId, state, pendingBowlerId, refresh]
  )

  const recordEvent = useCallback(
    (eventType, payload = {}) =>
      withWriteHandling(async () => {
        const clientActionId = scoringApi.generateClientActionId()
        await scoringApi.recordEvent(inningsId, { expectedVersion: state.innings.version, clientActionId, eventType, payload })
        await refresh()
      }),
    [withWriteHandling, inningsId, state, refresh]
  )

  const selectNextBatsman = useCallback(
    (end, matchPlayerId) => recordEvent('batsman-in', { end, matchPlayerId }),
    [recordEvent]
  )

  const changeBowler = useCallback(
    (matchPlayerId) => {
      setPendingBowlerId(matchPlayerId)
      setPendingBowlerOverNumber(state?.score?.overNumber ?? 0)
    },
    [state]
  )

  const previewCorrection = useCallback((targetType, targetId, patch) => scoringApi.previewCorrection(inningsId, { targetType, targetId, patch }), [inningsId])

  const applyCorrection = useCallback(
    (targetType, targetId, patch, reasonCode, note) =>
      withWriteHandling(async () => {
        const clientActionId = scoringApi.generateClientActionId()
        await scoringApi.applyCorrection(inningsId, { targetType, targetId, patch, reasonCode, note, expectedVersion: state.innings.version, clientActionId })
        await refresh()
      }),
    [withWriteHandling, inningsId, state, refresh]
  )

  const undoCorrection = useCallback(
    (correctionId) =>
      withWriteHandling(async () => {
        const clientActionId = scoringApi.generateClientActionId()
        await scoringApi.undoCorrection(inningsId, correctionId, { expectedVersion: state.innings.version, clientActionId })
        await refresh()
      }),
    [withWriteHandling, inningsId, state, refresh]
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
    pendingBowlerId,
    needsBowlerSelection,
    changeBowler,
    recordDelivery,
    recordEvent,
    selectNextBatsman,
    previewCorrection,
    applyCorrection,
    undoCorrection,
    refresh,
  }
}
