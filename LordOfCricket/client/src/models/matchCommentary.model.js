// Template-based commentary today; `generateBasicCommentary` is the seam that gets
// swapped for `generateAICommentary` later. Nothing here calls an external service.
import { getPlayer } from './umpireMatch.model.js'
import { dismissalLabel, formatOvers, getBallsRemaining, fieldingEventLabel, appealLabel, reviewTypeLabel } from './matchStats.model.js'

export function resultLabel(delivery) {
  if (delivery.isDeadBall) return 'Dead Ball'
  if (delivery.wicket) return 'WICKET'
  if (delivery.illegal?.type === 'wide') return 'Wide'
  if (delivery.illegal?.type === 'no-ball') return 'No Ball'
  if (delivery.extra?.type === 'bye') return 'Bye'
  if (delivery.extra?.type === 'leg-bye') return 'Leg Bye'
  if (delivery.runsBat === 6) return 'SIX'
  if (delivery.runsBat === 4) return 'FOUR'
  if (delivery.totalRuns === 0) return 'Dot Ball'
  return `${delivery.totalRuns} Run${delivery.totalRuns === 1 ? '' : 's'}`
}

export function generateBasicCommentary(delivery, match) {
  if (delivery.isDeadBall) return 'Dead ball called.'

  const striker = getPlayer(match, delivery.strikerId)
  const bowler = getPlayer(match, delivery.bowlerId)
  const region = delivery.shot?.region

  if (delivery.wicket) {
    const outPlayer = getPlayer(match, delivery.wicket.type === 'run-out' ? delivery.wicket.batsmanOutId : delivery.strikerId)
    const fielder = delivery.wicket.fielderId ? getPlayer(match, delivery.wicket.fielderId) : null
    return `WICKET! ${outPlayer?.name || 'Batsman'} is ${dismissalLabel(delivery.wicket.type).toLowerCase()}${fielder ? ` (${fielder.name})` : ''}${bowler ? `, bowled by ${bowler.name}` : ''}.`
  }

  if (delivery.illegal?.type === 'wide') {
    return `Wide down the leg side${delivery.illegal.runs > 1 ? `, ${delivery.illegal.runs} runs` : ''}.`
  }
  if (delivery.illegal?.type === 'no-ball') {
    return `No ball!${delivery.runsBat ? ` ${striker?.name || 'Batsman'} finds the gap for ${delivery.runsBat}.` : ' Free hit coming up.'}`
  }
  if (delivery.extra) {
    return `${delivery.totalRuns} run${delivery.totalRuns === 1 ? '' : 's'} added as ${delivery.extra.type === 'bye' ? 'byes' : 'leg byes'}.`
  }

  if (delivery.runsBat === 6) return `SIX! ${striker?.name || 'Batsman'} launches it${region ? ` over ${region}` : ''}.`
  if (delivery.runsBat === 4) return `FOUR! ${striker?.name || 'Batsman'} finds the gap${region ? ` through ${region}` : ''}.`
  if (delivery.totalRuns === 0) return `Dot ball. ${bowler?.name || 'Bowler'} keeps it tight.`
  return `${delivery.totalRuns} run${delivery.totalRuns === 1 ? '' : 's'}${region ? `, worked to ${region}` : ''}.`
}

const REVIEW_DECISION_LABELS = { out: 'OUT', 'not-out': 'NOT OUT', 'umpires-call': "UMPIRE'S CALL", inconclusive: 'INCONCLUSIVE' }

/** Human-readable line for a non-scoring match event, used by the unified timeline. */
export function describeMatchEvent(entry, match) {
  const payload = entry.payload || {}
  const batsman = getPlayer(match, payload.batsmanId)
  const bowler = getPlayer(match, payload.bowlerId)
  const fielder = getPlayer(match, payload.fielderId)

  switch (entry.event) {
    case 'catch-dropped':
      return `Catch Dropped! ${fielder?.name || 'A fielder'} spills a chance off ${batsman?.name || 'the batsman'}${bowler ? `, bowled by ${bowler.name}` : ''}.`
    case 'fielding-event':
      return `${fieldingEventLabel(payload.fieldingType)}${fielder ? ` — ${fielder.name}` : ''}.`
    case 'appeal':
      return `Appeal for ${appealLabel(payload.appealType)} — ${payload.decision === 'out' ? 'OUT' : 'NOT OUT'}.`
    case 'review':
      return `${reviewTypeLabel(payload.reviewType)} — ${REVIEW_DECISION_LABELS[payload.decision] || payload.decision}.`
    case 'penalty-runs':
      return `Penalty! +${payload.runs} runs to the ${payload.awardedTo === 'batting' ? 'batting' : 'fielding'} side.`
    case 'strike-swap':
      return 'Strike swapped.'
    case 'batsman-in':
      return `${getPlayer(match, payload.playerId)?.name || 'New batsman'} comes to the crease.`
    case 'bowler-change':
      return `${getPlayer(match, payload.bowlerId)?.name || 'New bowler'} to bowl.`
    case 'retire':
      return `${getPlayer(match, payload.playerId)?.name || 'Batsman'} retires ${payload.type === 'retired-hurt' ? 'hurt' : 'out'}.`
    default:
      return entry.event
  }
}

/** Short "17.4 — Kohli — SIX — Long On" style label, used by the undo confirmation. */
export function describeDeliveryLabel(delivery, match) {
  const striker = getPlayer(match, delivery.strikerId)
  const parts = [`${delivery.over - 1}.${delivery.ball - 1}`, striker?.name, resultLabel(delivery)]
  if (delivery.shot?.region) parts.push(delivery.shot.region)
  return parts.filter(Boolean).join(' — ')
}

/** AI-ready payload for a delivery — no AI service is called, this just shapes the future request. */
export function buildCommentaryContext(delivery, innings, match) {
  const striker = getPlayer(match, delivery.strikerId)
  const bowler = getPlayer(match, delivery.bowlerId)
  const battingStat = innings.batsmen[delivery.strikerId]
  const ballsRemaining = getBallsRemaining(match.format.oversPerInnings, innings.legalBalls)

  return {
    score: `${innings.runs}/${innings.wickets}`,
    over: formatOvers(innings.legalBalls),
    striker: striker ? { name: striker.name, runs: battingStat?.runs ?? 0, balls: battingStat?.balls ?? 0 } : null,
    bowler: bowler ? { name: bowler.name } : null,
    result: resultLabel(delivery),
    shot: delivery.shot?.shotType || null,
    region: delivery.shot?.region || null,
    fieldingEvent: null,
    requiredRuns: innings.target != null ? Math.max(0, innings.target - innings.runs) : null,
    ballsRemaining: innings.target != null ? ballsRemaining : null,
  }
}
