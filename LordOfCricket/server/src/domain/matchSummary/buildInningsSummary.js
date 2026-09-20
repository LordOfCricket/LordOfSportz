// Phase 9 — pure derivation of ONE innings' scorecard/timeline/wagon-wheel
// section from an already-replayed state. Consumes exactly the same
// replayInnings() output (plus the same selectors.js helpers) the live
// scorer and Edit Score already trust — this file adds zero new cricket
// rules, it only groups/labels/names facts replay.js already computed
// (Phase 9 Part 65: one cricket truth). No pg, no I/O.

import { dismissedPlayerId } from '../scoring/replay.js'
import { extractBattingPerformance, battingStrikeRate } from '../statistics/battingStats.js'
import { extractBowlingPerformance, bowlingEconomy } from '../statistics/bowlingStats.js'
import { formatOvers, calculateRunRate, getBallsRemaining, calculateRequiredRunRate, getTimeline, groupDeliveriesByOver, selectWagonWheelShots } from '../scoring/selectors.js'
import { formatDismissalText } from './dismissalText.js'

const UNKNOWN_PLAYER = Object.freeze({ publicPlayerId: null, name: 'Unknown Player', teamId: null, isCaptain: false, isWicketkeeper: false })

function resolvePlayer(roster, matchPlayerId) {
  if (matchPlayerId == null) return null
  return roster.get(matchPlayerId) || UNKNOWN_PLAYER
}

/** Chronological batting-entry order — NEVER Object.keys(state.batsmen)
 * (integer-like object keys silently re-sort numerically in JS, which would
 * scramble batting order by match_player id instead of real entry order —
 * Phase 9 Part 70). Order comes from 'batsman-in' events; membership is
 * cross-checked (as strings, since ids may be numeric match_player ids in
 * production or plain strings in domain tests) against state.batsmen so a
 * voided seating event (which applyEvent's voided branch never applies to
 * state.batsmen) can't produce a phantom batting-order entry. No backstop for
 * "a batsman with no seating event" — replay.js's applyDelivery only ever
 * credits state.batsmen[state.ends.strikerEnd], and ends are only ever
 * populated by a 'batsman-in' event, so that case cannot occur. */
function buildBattingOrder(state) {
  const seen = new Set(Object.keys(state.batsmen))
  const order = []
  for (const e of state.events) {
    if (e.eventType !== 'batsman-in') continue
    const id = e.payload.matchPlayerId
    if (seen.has(String(id)) && !order.includes(id)) order.push(id)
  }
  return order
}

/** First-appearance-as-bowler order (Phase 9 Part 71) — same
 * events-for-order / state-object-for-membership pattern as batting order,
 * using state.deliveries instead of a dedicated event type since bowler is
 * stamped directly on every delivery (see replay.js's module comment). No
 * backstop needed: every id in state.bowlers necessarily has at least one
 * corresponding delivery, since updateBowler is only ever called from
 * applyDelivery with that same delivery's bowlerMatchPlayerId. */
function buildBowlingOrder(state) {
  const seen = new Set(Object.keys(state.bowlers))
  const order = []
  for (const d of state.deliveries) {
    const id = d.bowlerMatchPlayerId
    if (id != null && seen.has(String(id)) && !order.includes(id)) order.push(id)
  }
  return order
}

function buildExtras(state) {
  let wides = 0
  let noBalls = 0
  let byes = 0
  let legByes = 0
  for (const d of state.deliveries) {
    if (d.voided) continue
    // illegal.runs is the FULL wide/no-ball extra contribution (mandatory 1 +
    // any additional run scored while the ball was illegal) — any runs the
    // batsman scored off the bat on a no-ball live in batRuns instead (never
    // in illegal.runs; see replay.js's module comment), so nothing here is
    // double-counted against the batting figures.
    if (d.illegal?.type === 'wide') wides += d.illegal.runs
    if (d.illegal?.type === 'no-ball') noBalls += d.illegal.runs
    if (d.extra?.type === 'bye') byes += d.extra.runs
    if (d.extra?.type === 'leg-bye') legByes += d.extra.runs
  }
  return { wides, noBalls, byes, legByes, total: wides + noBalls + byes + legByes }
}

function buildFallOfWickets(state, roster) {
  return state.fallOfWickets.map((fow) => ({
    wicketNumber: fow.wicketNumber,
    score: fow.score,
    overBall: `${fow.over}.${fow.ball}`,
    player: resolvePlayer(roster, fow.matchPlayerId),
  }))
}

function buildPartnerships(state, roster) {
  const completed = state.partnerships.map((p) => ({
    batsmen: p.batsmen.map((id) => resolvePlayer(roster, id)),
    runs: p.runs,
    balls: p.balls,
    endWicketNumber: p.endWicketNumber,
    unbeaten: false,
  }))
  // The ongoing pair at innings end (never dismissed, or an innings that's
  // still live) — only real when at least one batsman is actually seated;
  // a fresh reset right after the final all-out wicket has zero, and
  // correctly contributes nothing here.
  if (state.partnership.batsmen.length > 0) {
    completed.push({
      batsmen: state.partnership.batsmen.map((id) => resolvePlayer(roster, id)),
      runs: state.partnership.runs,
      balls: state.partnership.balls,
      endWicketNumber: null,
      unbeaten: true,
    })
  }
  return completed
}

function dismissalTextFor(wicketDelivery, roster) {
  if (!wicketDelivery) return null
  const bowler = resolvePlayer(roster, wicketDelivery.bowlerMatchPlayerId)
  const fielder = resolvePlayer(roster, wicketDelivery.wicket.fielderMatchPlayerId)
  const secondaryFielder = resolvePlayer(roster, wicketDelivery.wicket.secondaryFielderMatchPlayerId)
  return formatDismissalText(
    { type: wicketDelivery.wicket.type, fielderName: fielder?.name ?? null, secondaryFielderName: secondaryFielder?.name ?? null },
    bowler?.name ?? 'Unknown Bowler'
  )
}

function buildBattingRows(state, battingOrder, playingXiIds, inningsStatus, roster) {
  const rows = battingOrder.map((id) => {
    const perf = extractBattingPerformance(state, id)
    const status = perf.notOut ? 'NOT_OUT' : 'OUT'
    const wicketDelivery = perf.notOut ? null : state.deliveries.find((d) => d.wicket && dismissedPlayerId(d) === id)
    return {
      player: resolvePlayer(roster, id),
      runs: perf.runs,
      balls: perf.balls,
      fours: perf.fours,
      sixes: perf.sixes,
      strikeRate: battingStrikeRate(perf.runs, perf.balls),
      status,
      dismissalText: status === 'NOT_OUT' ? 'not out' : dismissalTextFor(wicketDelivery, roster),
    }
  })

  // DNB / YTB — Playing XI members of the batting team who never got a
  // batsman-in event. Distinct labels only matter while the innings is
  // still live (Phase 9 Part 14); once it's finished, everyone who never
  // batted is simply DNB (Part 13).
  const batted = new Set(battingOrder)
  for (const id of playingXiIds) {
    if (batted.has(id)) continue
    rows.push({
      player: resolvePlayer(roster, id),
      runs: null,
      balls: null,
      fours: null,
      sixes: null,
      strikeRate: null,
      status: inningsStatus === 'live' ? 'YTB' : 'DNB',
      dismissalText: null,
    })
  }
  return rows
}

function buildBowlingRows(state, bowlingOrder, ballsPerOver, roster) {
  return bowlingOrder.map((id) => {
    const perf = extractBowlingPerformance(state, id, ballsPerOver)
    let wides = 0
    let noBalls = 0
    for (const d of state.deliveries) {
      if (d.voided || d.bowlerMatchPlayerId !== id) continue
      if (d.illegal?.type === 'wide') wides += 1
      if (d.illegal?.type === 'no-ball') noBalls += 1
    }
    return {
      player: resolvePlayer(roster, id),
      oversLabel: formatOvers(perf.legalBalls, ballsPerOver),
      maidens: perf.maidens,
      runs: perf.runs,
      wickets: perf.wickets,
      economy: bowlingEconomy(perf.runs, perf.legalBalls, ballsPerOver),
      wides,
      noBalls,
    }
  })
}

function serializeDelivery(d, roster) {
  return {
    id: d.id,
    over: d.over,
    ball: d.ball,
    striker: resolvePlayer(roster, d.strikerMatchPlayerId),
    nonStriker: resolvePlayer(roster, d.nonStrikerMatchPlayerId),
    bowler: resolvePlayer(roster, d.bowlerMatchPlayerId),
    batRuns: d.batRuns,
    illegal: d.illegal,
    extra: d.extra,
    totalRuns: d.totalRuns,
    isLegalDelivery: d.isLegalDelivery,
    isFreeHit: d.isFreeHit,
    isDeadBall: d.isDeadBall,
    voided: d.voided,
    wicket: d.wicket
      ? { type: d.wicket.type, player: resolvePlayer(roster, dismissedPlayerId(d)), dismissalText: dismissalTextFor(d, roster) }
      : null,
  }
}

function buildOvers(state, roster) {
  const descending = groupDeliveriesByOver(state.deliveries)
  const ascending = descending.slice().reverse()
  let runningRuns = 0
  let runningWickets = 0
  return ascending.map((g) => {
    const live = g.deliveries.filter((d) => !d.voided)
    const runs = live.reduce((sum, d) => sum + d.totalRuns, 0)
    const wickets = live.filter((d) => d.wicket).length
    runningRuns += runs
    runningWickets += wickets
    const bowlerId = live[0]?.bowlerMatchPlayerId ?? g.deliveries[0]?.bowlerMatchPlayerId ?? null
    return {
      over: g.over,
      bowler: resolvePlayer(roster, bowlerId),
      runs,
      wickets,
      scoreAfter: `${runningRuns}/${runningWickets}`,
      deliveries: g.deliveries.map((d) => serializeDelivery(d, roster)),
    }
  })
}

function resolveEventPayload(payload, roster) {
  if (payload == null || typeof payload !== 'object') return payload
  const resolved = { ...payload }
  if ('matchPlayerId' in payload) resolved.player = resolvePlayer(roster, payload.matchPlayerId)
  return resolved
}

function buildTimeline(state, roster) {
  return getTimeline(state).map((entry) =>
    entry.kind === 'delivery'
      ? { kind: 'delivery', ...serializeDelivery(entry, roster) }
      : { kind: 'event', id: entry.id, eventType: entry.eventType, over: entry.over, ball: entry.ball, payload: resolveEventPayload(entry.payload, roster) }
  )
}

function buildWagonWheel(state, shotsByDeliveryId, roster) {
  return selectWagonWheelShots(state.deliveries, shotsByDeliveryId).map((shot) => ({
    id: shot.deliveryId,
    player: resolvePlayer(roster, shot.strikerMatchPlayerId),
    x: shot.x,
    y: shot.y,
    region: shot.region,
    runs: shot.runs,
    outcome: shot.outcome,
  }))
}

/**
 * @param {object} innings - the innings DB row (id, innings_number, batting_team_id, bowling_team_id, status)
 * @param {object} state - replayInnings() output for this innings
 * @param {object} format - { oversPerInnings, ballsPerOver, target }
 * @param {Map} roster - matchPlayerId -> { publicPlayerId, name, teamId, isCaptain, isWicketkeeper }
 * @param {Array} playingXiIds - match_player ids of the BATTING team's playing XI (for DNB/YTB)
 * @param {Map} shotsByDeliveryId - String(deliveryId) -> wagon_wheel_shots row
 */
export function buildInningsSummary({ innings, state, format, roster, playingXiIds, shotsByDeliveryId }) {
  const ballsPerOver = format.ballsPerOver
  const battingOrder = buildBattingOrder(state)
  const bowlingOrder = buildBowlingOrder(state)
  const lastDelivery = state.deliveries[state.deliveries.length - 1] || null

  const isLive = innings.status === 'live'
  const target = format.target ?? null
  let chase = null
  if (isLive && target != null) {
    const ballsRemaining = format.oversPerInnings != null ? getBallsRemaining(format.oversPerInnings, state.legalBalls, ballsPerOver) : null
    chase = {
      runsNeeded: Math.max(target - state.runs, 0),
      ballsRemaining,
      requiredRunRate: ballsRemaining != null ? calculateRequiredRunRate(target, state.runs, ballsRemaining, ballsPerOver) : null,
    }
  }

  return {
    inningsId: innings.id,
    inningsNumber: innings.innings_number,
    status: innings.status,
    battingTeamId: innings.batting_team_id,
    bowlingTeamId: innings.bowling_team_id,
    score: {
      runs: state.runs,
      wickets: state.wickets,
      legalBalls: state.legalBalls,
      oversLabel: formatOvers(state.legalBalls, ballsPerOver),
      endReason: !isLive ? (state.isTargetChased ? 'TARGET_CHASED' : state.isAllOut ? 'ALL_OUT' : state.isOversComplete ? 'OVERS_COMPLETE' : null) : null,
    },
    target,
    chase,
    current: isLive
      ? {
          striker: resolvePlayer(roster, state.ends.strikerEnd),
          nonStriker: resolvePlayer(roster, state.ends.nonStrikerEnd),
          bowler: resolvePlayer(roster, lastDelivery?.bowlerMatchPlayerId),
          partnership: { runs: state.partnership.runs, balls: state.partnership.balls },
        }
      : null,
    batting: buildBattingRows(state, battingOrder, playingXiIds, innings.status, roster),
    extras: buildExtras(state),
    total: { runs: state.runs, wickets: state.wickets, oversLabel: formatOvers(state.legalBalls, ballsPerOver), runRate: calculateRunRate(state.runs, state.legalBalls, ballsPerOver) },
    fallOfWickets: buildFallOfWickets(state, roster),
    bowling: buildBowlingRows(state, bowlingOrder, ballsPerOver, roster),
    partnerships: buildPartnerships(state, roster),
    overs: buildOvers(state, roster),
    timeline: buildTimeline(state, roster),
    wagonWheel: buildWagonWheel(state, shotsByDeliveryId, roster),
  }
}
