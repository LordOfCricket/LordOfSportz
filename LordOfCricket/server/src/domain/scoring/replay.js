// The pure, PostgreSQL-free cricket scoring engine — ported from
// client/src/models/matchEngine.model.js. No SQL, no I/O: a merged,
// log_sequence-ordered array of delivery/event entries goes in, a derived
// innings state comes out. Deterministic full-innings replay: given the same
// entries, always the same result.
//
// KEY DIFFERENCE FROM THE CLIENT ENGINE: bowler is authoritative input here,
// not derived. Striker/non-striker are still purely mechanical (a function of
// run-parity + explicit batsman-in/wicket events), so they stay derived — but
// who bowled a delivery is a human decision with no relationship to run
// outcomes, so every delivery entry must carry its own `bowlerMatchPlayerId`,
// and the fold simply reads it rather than tracking a "pending bowler" state
// set by bowler-change events. That is *why* correcting an earlier delivery's
// runs/extras/wicket never reassigns who bowled a later over: bowler was never
// computed from anything to begin with.
//
// Everything else (strike rotation, extras, wickets, free-hit, partnership,
// fall of wickets) mirrors the client engine's documented v1 scope exactly:
// a no-ball carries EITHER bat runs OR missed-contact byes/leg-byes, never
// both; a wide never carries byes/leg-byes; penalty runs are a standalone
// match event, never attached to a delivery.

import { BOWLER_CREDITED_DISMISSALS, DISMISSAL_TYPES } from './eventTypes.js'

function emptyBatsmanStat() {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: null }
}

function emptyBowlerStat() {
  return { legalBalls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0 }
}

function emptyInningsState(seed) {
  return {
    battingTeamId: seed.battingTeamId,
    bowlingTeamId: seed.bowlingTeamId,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    ends: { strikerEnd: null, nonStrikerEnd: null },
    bowlerMatchPlayerId: null,
    previousOverBowlerId: null,
    isFreeHitNext: false,
    deliveries: [],
    events: [],
    batsmen: {},
    bowlers: {},
    fallOfWickets: [],
    partnership: { runs: 0, balls: 0, batsmen: [] },
    // Completed partnerships only (the CURRENT/ongoing one stays in
    // `partnership` above, unchanged from its original v1 shape — every
    // existing consumer of `state.partnership` is unaffected). Closed out in
    // the wicket branch of applyDelivery, right where the current partnership
    // is already reset — same fold, same moment, no second derivation of
    // "did the pair change" anywhere else (Phase 9 Part 65).
    partnerships: [],
    penaltyRunsAwardedToBowlingTeam: 0,
    // Populated when a historical correction leaves the replay unable to safely
    // resolve something on its own (e.g. a stored run-out dismissed-player no
    // longer matches either current end). Never crashes or silently corrupts —
    // see the guard in applyDelivery below.
    conflicts: [],
  }
}

function updateBatsman(batsmen, matchPlayerId, runsBat, countsAsBallFaced) {
  if (!matchPlayerId) return batsmen
  const prev = batsmen[matchPlayerId] || emptyBatsmanStat()
  return {
    ...batsmen,
    [matchPlayerId]: {
      ...prev,
      runs: prev.runs + runsBat,
      balls: prev.balls + (countsAsBallFaced ? 1 : 0),
      fours: prev.fours + (runsBat === 4 ? 1 : 0),
      sixes: prev.sixes + (runsBat === 6 ? 1 : 0),
    },
  }
}

function updateBowler(bowlers, matchPlayerId, runsConceded, countsTowardOver, illegal, isDot) {
  if (!matchPlayerId) return bowlers
  const prev = bowlers[matchPlayerId] || emptyBowlerStat()
  return {
    ...bowlers,
    [matchPlayerId]: {
      ...prev,
      legalBalls: prev.legalBalls + (countsTowardOver ? 1 : 0),
      runs: prev.runs + runsConceded,
      dots: prev.dots + (isDot ? 1 : 0),
      wides: prev.wides + (illegal?.type === 'wide' ? 1 : 0),
      noBalls: prev.noBalls + (illegal?.type === 'no-ball' ? 1 : 0),
    },
  }
}

function buildEnrichedDelivery(state, input, meta, derived, ballsPerOver) {
  return {
    id: meta.id,
    logSequence: meta.logSequence,
    over: Math.floor(state.legalBalls / ballsPerOver) + 1,
    ball: (state.legalBalls % ballsPerOver) + 1,
    battingTeamId: state.battingTeamId,
    strikerMatchPlayerId: state.ends.strikerEnd,
    nonStrikerMatchPlayerId: state.ends.nonStrikerEnd,
    bowlerMatchPlayerId: input.bowlerMatchPlayerId,
    batRuns: input.batRuns || 0,
    illegal: input.illegal || null,
    extra: input.extra || null,
    wicket: input.wicket || null,
    isDeadBall: Boolean(input.isDeadBall),
    isFreeHit: state.isFreeHitNext,
    isLegalDelivery: derived.legal,
    totalRuns: derived.totalRuns,
    voided: Boolean(input.voided),
  }
}

/** Dismissal types allowed for the delivery about to be recorded. */
export function getAllowedDismissals(state, illegal) {
  if (state.isFreeHitNext) return ['run-out']
  if (illegal?.type === 'wide') return ['run-out', 'stumped', 'obstructing-field', 'hit-ball-twice']
  return DISMISSAL_TYPES
}

function applyDelivery(rawState, input, meta, ballsPerOver) {
  // Voided (Phase 4: "scorer accidentally recorded an extra delivery") — kept
  // visible in the timeline for audit, but contributes nothing to score,
  // strike rotation, stats, or legal-ball count. Mirrors how applyEvent
  // handles a voided event, and never removed from the log (log length/order
  // is never allowed to change — see Step 14 of the Phase 4 brief).
  if (input.voided) {
    return {
      ...rawState,
      deliveries: [...rawState.deliveries, buildEnrichedDelivery(rawState, input, meta, { legal: false, totalRuns: 0 }, ballsPerOver)],
    }
  }

  const state = input.swapStrikerNonStriker
    ? { ...rawState, ends: { strikerEnd: rawState.ends.nonStrikerEnd, nonStrikerEnd: rawState.ends.strikerEnd } }
    : rawState

  if (input.isDeadBall) {
    return {
      ...state,
      bowlerMatchPlayerId: input.bowlerMatchPlayerId,
      deliveries: [...state.deliveries, buildEnrichedDelivery(state, input, meta, { legal: false, totalRuns: 0 }, ballsPerOver)],
    }
  }

  const illegal = input.illegal
  const extra = input.extra
  const wicket = input.wicket

  const countsTowardOver = !illegal
  const countsAsBallFaced = illegal?.type !== 'wide'

  const runsBat = input.batRuns || 0
  const illegalRunRuns = illegal ? illegal.runs - 1 : 0
  const flatPenalty = illegal ? 1 : 0
  const totalRuns = runsBat + illegalRunRuns + flatPenalty + (extra?.runs || 0)
  const runsRun = wicket?.type === 'run-out' ? wicket.runsCompleted || 0 : runsBat + illegalRunRuns + (extra?.runs || 0)

  let next = { ...state, runs: state.runs + totalRuns, bowlerMatchPlayerId: input.bowlerMatchPlayerId }
  if (countsTowardOver) next.legalBalls += 1

  const strikerId = state.ends.strikerEnd
  const isCleanDismissal = wicket && wicket.type !== 'run-out'
  next.batsmen = updateBatsman(state.batsmen, strikerId, isCleanDismissal ? 0 : runsBat, countsAsBallFaced)

  const runsConceded = totalRuns - (extra?.runs || 0)
  const isDot = totalRuns === 0 && !wicket
  next.bowlers = updateBowler(state.bowlers, input.bowlerMatchPlayerId, runsConceded, countsTowardOver, illegal, isDot)

  next.ends = runsRun % 2 === 1
    ? { strikerEnd: state.ends.nonStrikerEnd, nonStrikerEnd: state.ends.strikerEnd }
    : { ...state.ends }

  if (wicket) {
    next.wickets = state.wickets + 1
    // Close out the partnership that was batting BEFORE this ball (the ball
    // on which a wicket falls has never counted toward either the closing or
    // the next partnership — see the reset below, unchanged since v1). Uses
    // `state.ends` (pre-this-delivery, but post any swap-striker remap at the
    // top of this function) rather than `state.partnership.batsmen`, which can
    // still be empty on a wicket-off-the-very-first-ball edge case.
    const closingPair = [state.ends.strikerEnd, state.ends.nonStrikerEnd].filter(Boolean)
    if (closingPair.length > 0) {
      next.partnerships = [
        ...state.partnerships,
        { batsmen: closingPair, runs: state.partnership.runs, balls: state.partnership.balls, endWicketNumber: next.wickets },
      ]
    }
    // Authoritative only for run-out (the scorer must say which end) — every
    // other dismissal type always attributes to whoever is on strike right now.
    const outId = wicket.type === 'run-out' ? wicket.dismissedMatchPlayerId : strikerId
    const outIdValid = !outId || outId === next.ends.strikerEnd || outId === next.ends.nonStrikerEnd
    if (!outIdValid) {
      next.conflicts = [
        ...state.conflicts,
        {
          type: 'PLAYER_STATE_CONFLICT',
          deliveryId: meta.id,
          message: 'Stored run-out dismissed player no longer matches either current end after a historical correction.',
          expectedPlayers: [next.ends.strikerEnd, next.ends.nonStrikerEnd].filter(Boolean),
          recordedDismissedPlayer: outId,
        },
      ]
    } else if (outId) {
      const prevStat = next.batsmen[outId] || emptyBatsmanStat()
      next.batsmen = { ...next.batsmen, [outId]: { ...prevStat, out: true, dismissal: wicket } }
      if (next.ends.strikerEnd === outId) next.ends = { ...next.ends, strikerEnd: null }
      else if (next.ends.nonStrikerEnd === outId) next.ends = { ...next.ends, nonStrikerEnd: null }
    }
    if (BOWLER_CREDITED_DISMISSALS.includes(wicket.type)) {
      next.bowlers = {
        ...next.bowlers,
        [input.bowlerMatchPlayerId]: {
          ...next.bowlers[input.bowlerMatchPlayerId],
          wickets: (next.bowlers[input.bowlerMatchPlayerId]?.wickets || 0) + 1,
        },
      }
    }
    next.fallOfWickets = [
      ...state.fallOfWickets,
      {
        wicketNumber: next.wickets,
        score: next.runs,
        over: Math.floor(next.legalBalls / ballsPerOver),
        ball: next.legalBalls % ballsPerOver,
        matchPlayerId: outId,
        dismissal: wicket,
      },
    ]
    next.partnership = { runs: 0, balls: 0, batsmen: [next.ends.strikerEnd, next.ends.nonStrikerEnd].filter(Boolean) }
  } else {
    next.partnership = {
      runs: state.partnership.runs + totalRuns,
      balls: state.partnership.balls + (countsTowardOver ? 1 : 0),
      batsmen: [next.ends.strikerEnd, next.ends.nonStrikerEnd].filter(Boolean),
    }
  }

  next.isFreeHitNext = illegal?.type === 'no-ball' ? true : illegal?.type === 'wide' ? state.isFreeHitNext : false

  if (countsTowardOver && next.legalBalls % ballsPerOver === 0 && next.wickets < 10) {
    next.ends = { strikerEnd: next.ends.nonStrikerEnd, nonStrikerEnd: next.ends.strikerEnd }
    next.previousOverBowlerId = input.bowlerMatchPlayerId
  }

  next.deliveries = [...state.deliveries, buildEnrichedDelivery(state, input, meta, { legal: countsTowardOver, totalRuns }, ballsPerOver)]
  return next
}

function applyEvent(state, entry, ballsPerOver) {
  const { eventType, payload } = entry
  const eventRecord = {
    id: entry.id,
    logSequence: entry.logSequence,
    eventType,
    payload,
    over: Math.floor(state.legalBalls / ballsPerOver) + 1,
    ball: (state.legalBalls % ballsPerOver) + 1,
  }

  if (entry.voided) {
    return { ...state, events: [...state.events, eventRecord] }
  }

  switch (eventType) {
    case 'batsman-in': {
      const occupant = state.ends[payload.end]
      if (occupant && occupant !== payload.matchPlayerId) {
        return {
          ...state,
          events: [...state.events, eventRecord],
          conflicts: [
            ...state.conflicts,
            {
              type: 'LINEUP_CONFLICT',
              eventId: entry.id,
              message: `Cannot seat player at ${payload.end}: already occupied after replay.`,
              end: payload.end,
              occupantId: occupant,
              incomingId: payload.matchPlayerId,
            },
          ],
        }
      }
      const batsmen = state.batsmen[payload.matchPlayerId] ? state.batsmen : { ...state.batsmen, [payload.matchPlayerId]: emptyBatsmanStat() }
      return { ...state, ends: { ...state.ends, [payload.end]: payload.matchPlayerId }, batsmen, events: [...state.events, eventRecord] }
    }
    // Informational only — bowler is stamped directly on each delivery, so
    // this event doesn't feed replay math. Kept for the match timeline/audit
    // ("Bumrah comes on to bowl") and as a future validation hint.
    case 'bowler-change':
      return { ...state, events: [...state.events, eventRecord] }
    case 'strike-swap':
      return { ...state, ends: { strikerEnd: state.ends.nonStrikerEnd, nonStrikerEnd: state.ends.strikerEnd }, events: [...state.events, eventRecord] }
    case 'retire': {
      const outId = payload.matchPlayerId
      const prevStat = state.batsmen[outId] || emptyBatsmanStat()
      const ends =
        state.ends.strikerEnd === outId
          ? { ...state.ends, strikerEnd: null }
          : state.ends.nonStrikerEnd === outId
            ? { ...state.ends, nonStrikerEnd: null }
            : state.ends
      return {
        ...state,
        ends,
        batsmen: { ...state.batsmen, [outId]: { ...prevStat, out: true, dismissal: { type: payload.type } } },
        events: [...state.events, eventRecord],
      }
    }
    case 'penalty-runs':
      return {
        ...state,
        runs: payload.awardedTo === 'batting' ? state.runs + payload.runs : state.runs,
        penaltyRunsAwardedToBowlingTeam:
          payload.awardedTo === 'fielding' ? state.penaltyRunsAwardedToBowlingTeam + payload.runs : state.penaltyRunsAwardedToBowlingTeam,
        events: [...state.events, eventRecord],
      }
    default:
      return { ...state, events: [...state.events, eventRecord] }
  }
}

/**
 * The deterministic replay/derive engine. `log` is a merged, log_sequence-
 * ordered array of `{ kind: 'delivery', ... }` and `{ kind: 'event', ... }`
 * entries (exactly what a repository's loadInningsLog produces). Pure: no
 * database access happens inside this fold — load everything first, then call
 * this. Given identical seed + format + log, always produces identical output,
 * which is what makes historical correction ("patch one entry, refold
 * everything") safe and deterministic.
 */
export function replayInnings(log, seed, format) {
  const ballsPerOver = format?.ballsPerOver || 6
  let state = emptyInningsState(seed)

  for (const entry of log) {
    if (entry.kind === 'delivery') {
      state = applyDelivery(state, entry, { id: entry.id, logSequence: entry.logSequence }, ballsPerOver)
    } else {
      state = applyEvent(state, entry, ballsPerOver)
    }
  }

  return {
    ...state,
    overNumber: Math.floor(state.legalBalls / ballsPerOver),
    ballInOver: state.legalBalls % ballsPerOver,
    ballsPerOver,
    pendingBatsmanSelection: !state.ends.strikerEnd ? 'strikerEnd' : !state.ends.nonStrikerEnd ? 'nonStrikerEnd' : null,
    // All-out threshold respects the actual participating batting roster
    // (Phase 6: LOC supports non-11-a-side local matches) — falls back to the
    // classic 10 only when the caller doesn't supply a roster size, which
    // keeps every hand-authored domain test unaffected.
    isAllOut: state.wickets >= (format?.battingTeamPlayingXiCount != null ? format.battingTeamPlayingXiCount - 1 : 10),
    isOversComplete: format?.oversPerInnings != null && state.legalBalls >= format.oversPerInnings * ballsPerOver,
    // A chase innings only — target is null for innings 1. Completes the
    // instant the target is reached, not at the end of the over/innings.
    isTargetChased: format?.target != null && state.runs >= format.target,
  }
}

function deliverySignature(d) {
  return `${d.strikerMatchPlayerId}|${d.nonStrikerMatchPlayerId}|${d.bowlerMatchPlayerId}|${d.totalRuns}|${d.voided}|${JSON.stringify(d.wicket)}`
}

// Exported so read models (Phase 9 match summary) can find "which delivery
// dismissed this batter" without re-deriving this mapping a second time.
export function dismissedPlayerId(delivery) {
  if (!delivery.wicket) return null
  return delivery.wicket.type === 'run-out' ? delivery.wicket.dismissedMatchPlayerId : delivery.strikerMatchPlayerId
}

/**
 * "Patch one entry, refold everything" — the whole correction strategy in one
 * function. `patch` is merged into the targeted entry's fields (delivery) or
 * `payload` (event); log length/order/identity never changes, which is what
 * lets `before.deliveries[i]`/`after.deliveries[i]` stay index-aligned for an
 * honest pairwise diff (never a raw "everything after this index" count,
 * which would overstate corrections that don't actually change replay output —
 * e.g. a wagon-wheel-only edit affects zero deliveries' scoring state).
 */
export function previewCorrection(log, seed, format, entryId, patch) {
  const index = log.findIndex((e) => e.id === entryId)
  if (index === -1) return null

  const before = replayInnings(log, seed, format)
  const patchedLog = log.slice()
  const target = patchedLog[index]
  if (target.kind === 'delivery') {
    patchedLog[index] = { ...target, ...patch }
  } else {
    // `voided` lives on the event entry itself (mirrors deliveries.voided),
    // never inside payload — everything else in `patch` is event-specific data
    // and belongs in payload. Splitting them here is what makes "void this
    // fielding event" actually take effect in replay (applyEvent only checks
    // entry.voided), instead of silently becoming inert payload.voided.
    const { voided, ...payloadPatch } = patch
    patchedLog[index] = {
      ...target,
      ...(voided !== undefined ? { voided } : {}),
      payload: { ...target.payload, ...payloadPatch },
    }
  }
  const after = replayInnings(patchedLog, seed, format)

  let affectedDeliveryCount = 0
  const dismissedPlayerChanges = []
  for (let i = 0; i < before.deliveries.length; i++) {
    const b = before.deliveries[i]
    const a = after.deliveries[i]
    if (!a) break
    if (deliverySignature(b) !== deliverySignature(a)) affectedDeliveryCount += 1

    const bOut = dismissedPlayerId(b)
    const aOut = dismissedPlayerId(a)
    if (bOut !== aOut) dismissedPlayerChanges.push({ deliveryId: a.id, over: a.over, ball: a.ball, before: bOut, after: aOut })
  }

  return {
    index,
    targetKind: target.kind,
    before,
    after,
    patchedLog,
    affectedDeliveryCount,
    dismissedPlayerChanges,
    conflictDelta: after.conflicts.length - before.conflicts.length,
    hasConflicts: after.conflicts.length > 0,
  }
}
