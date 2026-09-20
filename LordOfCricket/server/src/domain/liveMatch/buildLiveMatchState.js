// Phase 10 Part 3 — pure derivation of the LIGHTWEIGHT spectator live-state
// DTO from an already-replayed innings state. Deliberately NOT Phase 9's
// buildInningsSummary: no batting/bowling scorecards, no fall of wickets, no
// partnerships, no timeline, no wagon wheel — those are WARM/COLD data
// (Part 50) a spectator's 3-second poll must never re-download. This file
// adds zero new cricket rules — it reuses the exact same selectors.js/
// battingStats.js/bowlingStats.js functions Phase 9 already trusts (Part 65),
// just building a much smaller response.

import { formatOvers, calculateRunRate, getBallsRemaining, calculateRequiredRunRate, groupDeliveriesByOver } from '../scoring/selectors.js'
import { extractBattingPerformance, battingStrikeRate } from '../statistics/battingStats.js'
import { extractBowlingPerformance, bowlingEconomy } from '../statistics/bowlingStats.js'

// Bounded (Part 35/66/120) — the response never grows with innings length,
// no matter how many deliveries have been bowled.
export const RECENT_DELIVERIES_LIMIT = 12

const UNKNOWN_PLAYER = Object.freeze({ publicPlayerId: null, name: 'Unknown Player' })

function resolvePlayer(roster, matchPlayerId) {
  if (matchPlayerId == null) return null
  return roster.get(matchPlayerId) || UNKNOWN_PLAYER
}

/** Same ball-chip-compatible shape ballLabel()/ballClass() already expect
 * (client/src/components/match-summary/ballChip.js) — no server-side label
 * string, no fielder/dismissal-type detail (that belongs to the full Phase 9
 * summary/timeline, not a field polled every 3 seconds). `wicket` is
 * deliberately just a boolean here — ballLabel only checks truthiness. */
function compactDelivery(d) {
  return {
    id: d.id,
    over: d.over,
    ball: d.ball,
    batRuns: d.batRuns,
    illegal: d.illegal,
    extra: d.extra,
    totalRuns: d.totalRuns,
    isLegalDelivery: d.isLegalDelivery,
    isFreeHit: d.isFreeHit,
    voided: d.voided,
    isDeadBall: d.isDeadBall,
    wicket: Boolean(d.wicket),
  }
}

function buildBatsmanFigure(state, matchPlayerId, roster) {
  if (!matchPlayerId) return null
  const perf = extractBattingPerformance(state, matchPlayerId)
  if (!perf) return null
  return {
    player: resolvePlayer(roster, matchPlayerId),
    runs: perf.runs,
    balls: perf.balls,
    fours: perf.fours,
    sixes: perf.sixes,
    strikeRate: battingStrikeRate(perf.runs, perf.balls),
  }
}

function buildBowlerFigure(state, matchPlayerId, ballsPerOver, roster) {
  if (!matchPlayerId) return null
  const perf = extractBowlingPerformance(state, matchPlayerId, ballsPerOver)
  if (!perf) return null
  return {
    player: resolvePlayer(roster, matchPlayerId),
    oversLabel: formatOvers(perf.legalBalls, ballsPerOver),
    runs: perf.runs,
    wickets: perf.wickets,
    economy: bowlingEconomy(perf.runs, perf.legalBalls, ballsPerOver),
  }
}

/**
 * @param {object} innings - the FRESH innings row from getInningsState (id, innings_number, version, status, batting_team_id, bowling_team_id)
 * @param {object} state - replayInnings() output
 * @param {object} format - { oversPerInnings, ballsPerOver }
 * @param {number|null} target - null for innings 1 (not chasing yet)
 * @param {Map} roster - matchPlayerId -> { publicPlayerId, name }
 */
export function buildLiveInningsState({ innings, state, format, target, roster }) {
  const ballsPerOver = format.ballsPerOver
  const isLive = innings.status === 'live'
  const lastDelivery = state.deliveries[state.deliveries.length - 1] || null

  let chase = null
  if (isLive && target != null) {
    const ballsRemaining = format.oversPerInnings != null ? getBallsRemaining(format.oversPerInnings, state.legalBalls, ballsPerOver) : null
    chase = {
      runsNeeded: Math.max(target - state.runs, 0),
      ballsRemaining,
      requiredRunRate: ballsRemaining != null ? calculateRequiredRunRate(target, state.runs, ballsRemaining, ballsPerOver) : null,
    }
  }

  // groupDeliveriesByOver returns newest-over-first (selectors.js) — [0] is
  // the over currently in progress (or the last one bowled, at innings break).
  const overGroups = groupDeliveriesByOver(state.deliveries)
  const currentOver = (overGroups[0]?.deliveries || []).map(compactDelivery)
  const recentDeliveries = state.deliveries.slice(-RECENT_DELIVERIES_LIMIT).reverse().map(compactDelivery)

  return {
    id: innings.id,
    number: innings.innings_number,
    version: innings.version,
    status: innings.status,
    battingTeamId: innings.batting_team_id,
    bowlingTeamId: innings.bowling_team_id,
    runs: state.runs,
    wickets: state.wickets,
    legalBalls: state.legalBalls,
    oversLabel: formatOvers(state.legalBalls, ballsPerOver),
    currentRunRate: calculateRunRate(state.runs, state.legalBalls, ballsPerOver),
    chase,
    // Only meaningful while the innings is actually being bowled — at
    // innings break/completion there is no "current" batsman/bowler to show
    // (Part 21: the UI shows the FINISHED first-innings score instead).
    striker: isLive ? buildBatsmanFigure(state, state.ends.strikerEnd, roster) : null,
    nonStriker: isLive ? buildBatsmanFigure(state, state.ends.nonStrikerEnd, roster) : null,
    bowler: isLive ? buildBowlerFigure(state, lastDelivery?.bowlerMatchPlayerId, ballsPerOver, roster) : null,
    currentOver,
    recentDeliveries,
  }
}
