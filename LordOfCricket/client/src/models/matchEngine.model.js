// The only place cricket scoring rules live. Everything here is a pure function:
// a delivery/event log goes in, a derived innings/match state comes out. Undo is
// "drop the last log entry and refold"; historical correction (any entry, not just the
// last) is "patch it and refold" via `correctEntry` — neither needs bespoke inverse-mutation
// code because nothing here is mutated in place, and `deriveInningsState` already IS the
// deterministic replay engine a correction needs (see `previewCorrection`).
//
// v1 scope (documented, not guessed): a no-ball can carry EITHER bat runs OR
// missed-contact byes/leg-byes, never both on the same delivery (the real compound
// case is rare and out of scope for now). A wide never carries byes/leg-byes — all
// wide-adjacent runs are scored as wide runs (Law 22.11). Penalty runs are a
// standalone match event, not attached to a delivery.

import { DISMISSAL_TYPES, BOWLER_CREDITED_DISMISSALS } from './umpireMatch.model.js'

export function createDeliveryEntry(outcome) {
  return { id: crypto.randomUUID(), type: 'delivery', timestamp: new Date(), outcome }
}

export function createEventEntry(event, payload = {}) {
  return { id: crypto.randomUUID(), type: 'event', event, timestamp: new Date(), payload }
}

/** The single primitive for every kind of historical correction — runs, extra, wicket,
 * striker, bowler, shot, or voiding an event. Never changes log length or entry identity. */
export function correctEntry(entry, patch) {
  return entry.type === 'delivery' ? { ...entry, outcome: { ...entry.outcome, ...patch } } : { ...entry, payload: { ...entry.payload, ...patch } }
}

function emptyBatsmanStat() {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: null }
}

function emptyBowlerStat() {
  return { legalBalls: 0, runs: 0, wickets: 0, dots: 0, wides: 0, noBalls: 0 }
}

function emptyInningsState(battingTeamId, bowlingTeamId) {
  return {
    battingTeamId,
    bowlingTeamId,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    ends: { strikerEnd: null, nonStrikerEnd: null },
    bowlerId: null,
    previousOverBowlerId: null,
    isFreeHitNext: false,
    deliveries: [],
    events: [],
    batsmen: {},
    bowlers: {},
    fallOfWickets: [],
    partnership: { runs: 0, balls: 0, batsmen: [] },
    penaltyRunsAwardedToBowlingTeam: 0,
    // Populated when a historical correction leaves the replay in a state it can't safely
    // resolve on its own (e.g. a substitution event firing against an end that isn't actually
    // vacant). Never causes a crash or silent corruption — see the two guards below.
    conflicts: [],
  }
}

function updateBatsman(batsmen, playerId, runsBat, countsAsBallFaced) {
  if (!playerId) return batsmen
  const prev = batsmen[playerId] || emptyBatsmanStat()
  return {
    ...batsmen,
    [playerId]: {
      ...prev,
      runs: prev.runs + runsBat,
      balls: prev.balls + (countsAsBallFaced ? 1 : 0),
      fours: prev.fours + (runsBat === 4 ? 1 : 0),
      sixes: prev.sixes + (runsBat === 6 ? 1 : 0),
    },
  }
}

function updateBowler(bowlers, playerId, runsConceded, countsTowardOver, illegal, isDot) {
  if (!playerId) return bowlers
  const prev = bowlers[playerId] || emptyBowlerStat()
  return {
    ...bowlers,
    [playerId]: {
      ...prev,
      legalBalls: prev.legalBalls + (countsTowardOver ? 1 : 0),
      runs: prev.runs + runsConceded,
      dots: prev.dots + (isDot ? 1 : 0),
      wides: prev.wides + (illegal?.type === 'wide' ? 1 : 0),
      noBalls: prev.noBalls + (illegal?.type === 'no-ball' ? 1 : 0),
    },
  }
}

function buildEnrichedDelivery(state, outcome, meta, derived) {
  return {
    id: meta.id,
    timestamp: meta.timestamp,
    over: Math.floor(state.legalBalls / 6) + 1,
    ball: (state.legalBalls % 6) + 1,
    battingTeamId: state.battingTeamId,
    strikerId: state.ends.strikerEnd,
    nonStrikerId: state.ends.nonStrikerEnd,
    bowlerId: state.bowlerId,
    runsBat: outcome.runsBat || 0,
    illegal: outcome.illegal || null,
    extra: outcome.extra || null,
    wicket: outcome.wicket || null,
    shot: outcome.shot || null,
    isDeadBall: Boolean(outcome.isDeadBall),
    isFreeHit: state.isFreeHitNext,
    isLegalDelivery: derived.legal,
    totalRuns: derived.totalRuns,
  }
}

/** Dismissal types allowed for the delivery about to be recorded. */
export function getAllowedDismissals(inningsState, illegal) {
  if (inningsState.isFreeHitNext) return ['run-out']
  if (illegal?.type === 'wide') return ['run-out', 'stumped', 'obstructing-field', 'hit-ball-twice']
  return DISMISSAL_TYPES.map((d) => d.id)
}

function applyDelivery(rawState, outcome, meta) {
  // A pure "correct the striker" flag, shadowed here (before anything else reads `state`) so
  // every downstream read — stats, wicket target resolution, rotation, the enriched delivery's
  // own strikerId/nonStrikerId — picks up the correction automatically instead of needing to
  // be touched individually.
  const state = outcome.swapStrikerNonStriker
    ? { ...rawState, ends: { strikerEnd: rawState.ends.nonStrikerEnd, nonStrikerEnd: rawState.ends.strikerEnd } }
    : rawState

  if (outcome.isDeadBall) {
    return {
      ...state,
      deliveries: [...state.deliveries, buildEnrichedDelivery(state, outcome, meta, { legal: false, totalRuns: 0 })],
    }
  }

  const illegal = outcome.illegal
  const extra = outcome.extra
  const wicket = outcome.wicket

  const countsTowardOver = !illegal
  const countsAsBallFaced = illegal?.type !== 'wide'

  const runsBat = outcome.runsBat || 0
  // `illegal.runs` is the TOTAL for a wide (flat +1 plus any scampered runs) but a fixed 1
  // for a no-ball (bat/bye runs on a no-ball are tracked separately via runsBat/extra so
  // they aren't double-counted). This split lets a no-ball carry both the flat penalty and
  // bat runs without the two silently overwriting each other.
  const illegalRunRuns = illegal ? illegal.runs - 1 : 0
  const flatPenalty = illegal ? 1 : 0
  const totalRuns = runsBat + illegalRunRuns + flatPenalty + (extra?.runs || 0)
  // Rotation-eligible runs exclude only the flat +1 penalty, which is never "run".
  const runsRun = wicket?.type === 'run-out' ? wicket.runsCompleted || 0 : runsBat + illegalRunRuns + (extra?.runs || 0)

  let next = { ...state, runs: state.runs + totalRuns }
  if (countsTowardOver) next.legalBalls += 1

  const strikerId = state.ends.strikerEnd
  const isCleanDismissal = wicket && wicket.type !== 'run-out'
  next.batsmen = updateBatsman(state.batsmen, strikerId, isCleanDismissal ? 0 : runsBat, countsAsBallFaced)

  if (state.bowlerId) {
    const runsConceded = totalRuns - (extra?.runs || 0)
    const isDot = totalRuns === 0 && !wicket
    next.bowlers = updateBowler(state.bowlers, state.bowlerId, runsConceded, countsTowardOver, illegal, isDot)
  }

  // Rotate for runs run (ends-based, so run-out ordering below is correct by construction).
  next.ends = runsRun % 2 === 1
    ? { strikerEnd: state.ends.nonStrikerEnd, nonStrikerEnd: state.ends.strikerEnd }
    : { ...state.ends }

  if (wicket) {
    next.wickets = state.wickets + 1
    const outId = wicket.type === 'run-out' ? wicket.batsmanOutId : strikerId
    // A historical correction upstream can shift strike parity enough that a stored run-out
    // batsmanOutId no longer matches either current end. Silently doing nothing here would
    // still count the wicket and mark someone out without ever vacating a crease — worse than
    // the batsman-in case below because it corrupts within this delivery's own fold, not via a
    // stale downstream event. Flag it instead of guessing which end to clear.
    const outIdValid = !outId || outId === next.ends.strikerEnd || outId === next.ends.nonStrikerEnd
    if (!outIdValid) {
      next.conflicts = [
        ...state.conflicts,
        { type: 'wicket-conflict', deliveryId: meta.id, outId, strikerEnd: next.ends.strikerEnd, nonStrikerEnd: next.ends.nonStrikerEnd },
      ]
    } else if (outId) {
      const prevStat = next.batsmen[outId] || emptyBatsmanStat()
      next.batsmen = { ...next.batsmen, [outId]: { ...prevStat, out: true, dismissal: wicket } }
      if (next.ends.strikerEnd === outId) next.ends = { ...next.ends, strikerEnd: null }
      else if (next.ends.nonStrikerEnd === outId) next.ends = { ...next.ends, nonStrikerEnd: null }
    }
    if (state.bowlerId && BOWLER_CREDITED_DISMISSALS.includes(wicket.type)) {
      next.bowlers = {
        ...next.bowlers,
        [state.bowlerId]: { ...next.bowlers[state.bowlerId], wickets: (next.bowlers[state.bowlerId]?.wickets || 0) + 1 },
      }
    }
    next.fallOfWickets = [
      ...state.fallOfWickets,
      { wicketNumber: next.wickets, score: next.runs, over: Math.floor(next.legalBalls / 6), ball: next.legalBalls % 6, playerId: outId, dismissal: wicket },
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

  if (countsTowardOver && next.legalBalls % 6 === 0 && next.wickets < 10) {
    next.ends = { strikerEnd: next.ends.nonStrikerEnd, nonStrikerEnd: next.ends.strikerEnd }
    next.previousOverBowlerId = state.bowlerId
    next.bowlerId = null
  }

  next.deliveries = [...state.deliveries, buildEnrichedDelivery(state, outcome, meta, { legal: countsTowardOver, totalRuns })]
  return next
}

function applyEvent(state, entry) {
  const { event, payload } = entry
  // Tagged with the same over/ball position a delivery logged right now would get, so the
  // timeline can show "17.3 — Catch Dropped" consistently with delivery entries.
  const eventRecord = {
    id: entry.id,
    timestamp: entry.timestamp,
    event,
    payload,
    over: Math.floor(state.legalBalls / 6) + 1,
    ball: (state.legalBalls % 6) + 1,
  }

  // A corrected/removed wicket upstream can leave this event stale (e.g. the substitute batsman
  // it brought in was never actually needed). Voiding keeps it visible/struck-through in history
  // instead of deleting from the middle of the log — deletion would break the length-invariant
  // the correction preview's pairwise diff relies on.
  if (payload?.voided) {
    return { ...state, events: [...state.events, eventRecord] }
  }

  switch (event) {
    case 'batsman-in': {
      const occupant = state.ends[payload.end]
      if (occupant && occupant !== payload.playerId) {
        return {
          ...state,
          events: [...state.events, eventRecord],
          conflicts: [...state.conflicts, { type: 'lineup-conflict', eventId: entry.id, end: payload.end, occupantId: occupant, incomingId: payload.playerId }],
        }
      }
      const batsmen = state.batsmen[payload.playerId] ? state.batsmen : { ...state.batsmen, [payload.playerId]: emptyBatsmanStat() }
      return { ...state, ends: { ...state.ends, [payload.end]: payload.playerId }, batsmen, events: [...state.events, eventRecord] }
    }
    case 'bowler-change':
      return { ...state, previousOverBowlerId: state.bowlerId, bowlerId: payload.bowlerId, events: [...state.events, eventRecord] }
    case 'strike-swap':
      return { ...state, ends: { strikerEnd: state.ends.nonStrikerEnd, nonStrikerEnd: state.ends.strikerEnd }, events: [...state.events, eventRecord] }
    case 'retire': {
      const outId = payload.playerId
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
        penaltyRunsAwardedToBowlingTeam: payload.awardedTo === 'fielding' ? state.penaltyRunsAwardedToBowlingTeam + payload.runs : state.penaltyRunsAwardedToBowlingTeam,
        events: [...state.events, eventRecord],
      }
    default:
      return { ...state, events: [...state.events, eventRecord] }
  }
}

export function deriveInningsState(log, seed, oversLimit) {
  let state = emptyInningsState(seed.battingTeamId, seed.bowlingTeamId)
  for (const entry of log) {
    state = entry.type === 'delivery' ? applyDelivery(state, entry.outcome, { id: entry.id, timestamp: entry.timestamp }) : applyEvent(state, entry)
  }

  return {
    ...state,
    overNumber: Math.floor(state.legalBalls / 6),
    ballInOver: state.legalBalls % 6,
    pendingBatsmanSelection: !state.ends.strikerEnd ? 'strikerEnd' : !state.ends.nonStrikerEnd ? 'nonStrikerEnd' : null,
    pendingBowlerSelection: !state.bowlerId,
    isAllOut: state.wickets >= 10,
    isOversComplete: oversLimit != null && state.legalBalls >= oversLimit * 6,
  }
}

export function deriveMatchState(match) {
  const innings = []
  for (let i = 0; i < match.innings.length; i++) {
    const raw = match.innings[i]
    const derived = deriveInningsState(raw.log, raw, match.format.oversPerInnings)
    innings.push({ ...derived, target: i > 0 ? innings[i - 1].runs + 1 : null })
  }

  return { ...match, innings, currentInnings: innings[match.currentInningsIndex] }
}

function deliverySignature(d) {
  return `${d.strikerId}|${d.nonStrikerId}|${d.bowlerId}|${d.totalRuns}|${JSON.stringify(d.wicket)}`
}

function dismissedPlayerId(delivery) {
  if (!delivery.wicket) return null
  return delivery.wicket.type === 'run-out' ? delivery.wicket.batsmanOutId : delivery.strikerId
}

/**
 * `deriveInningsState` already IS the replay engine — a correction is just "patch one entry,
 * refold." This wraps that in a before/after pair plus an honest pairwise diff (never a raw
 * "everything after this index" count, which would overstate corrections that don't actually
 * change replay, e.g. a wagon-wheel-only edit). Safe because `correctEntry` never changes log
 * length, so `before.deliveries[i]`/`after.deliveries[i]` stay index-aligned.
 */
export function previewCorrection(log, seed, oversLimit, entryId, patch) {
  const index = log.findIndex((e) => e.id === entryId)
  if (index === -1) return null

  const before = deriveInningsState(log, seed, oversLimit)
  const patchedLog = log.slice()
  patchedLog[index] = correctEntry(patchedLog[index], patch)
  const after = deriveInningsState(patchedLog, seed, oversLimit)

  let affectedDeliveryCount = 0
  const dismissedPlayerChanges = []
  for (let i = 0; i < before.deliveries.length; i++) {
    const beforeDelivery = before.deliveries[i]
    const afterDelivery = after.deliveries[i]
    if (!afterDelivery) break
    if (deliverySignature(beforeDelivery) !== deliverySignature(afterDelivery)) affectedDeliveryCount += 1

    const beforeDismissedId = dismissedPlayerId(beforeDelivery)
    const afterDismissedId = dismissedPlayerId(afterDelivery)
    if (beforeDismissedId && afterDismissedId && beforeDismissedId !== afterDismissedId) {
      dismissedPlayerChanges.push({
        deliveryId: afterDelivery.id,
        over: afterDelivery.over,
        ball: afterDelivery.ball,
        before: beforeDismissedId,
        after: afterDismissedId,
      })
    }
  }

  return {
    before,
    after,
    patchedLog,
    affectedDeliveryCount,
    conflictDelta: after.conflicts.length - before.conflicts.length,
    dismissedPlayerChanges,
  }
}
