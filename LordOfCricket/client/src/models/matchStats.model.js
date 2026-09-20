// Derived/selector helpers — all pure functions over the state `matchEngine.model.js` produces.
import { DISMISSAL_TYPES, FIELDING_EVENT_TYPES, APPEAL_TYPES, REVIEW_TYPES } from './umpireMatch.model.js'

const DISMISSAL_LABELS = Object.fromEntries(DISMISSAL_TYPES.map((d) => [d.id, d.label]))
const FIELDING_EVENT_LABELS = Object.fromEntries(FIELDING_EVENT_TYPES.map((d) => [d.id, d.label]))
const APPEAL_LABELS = Object.fromEntries(APPEAL_TYPES.map((d) => [d.id, d.label]))
const REVIEW_LABELS = Object.fromEntries(REVIEW_TYPES.map((d) => [d.id, d.label]))

export function dismissalLabel(type) {
  return DISMISSAL_LABELS[type] || type
}

export function fieldingEventLabel(type) {
  return FIELDING_EVENT_LABELS[type] || type
}

export function appealLabel(type) {
  return APPEAL_LABELS[type] || type
}

export function reviewTypeLabel(type) {
  return REVIEW_LABELS[type] || type
}

export function formatOvers(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
}

export function calculateRunRate(runs, legalBalls) {
  if (!legalBalls) return 0
  return runs / (legalBalls / 6)
}

export function getBallsRemaining(oversLimit, legalBalls) {
  return Math.max(0, oversLimit * 6 - legalBalls)
}

export function calculateRequiredRunRate(target, runsScored, ballsRemaining) {
  if (target == null || ballsRemaining <= 0) return null
  const runsNeeded = target - runsScored
  if (runsNeeded <= 0) return 0
  return runsNeeded / (ballsRemaining / 6)
}

export function getCurrentOverDeliveries(deliveries, overNumber) {
  return deliveries.filter((d) => d.over === overNumber + 1)
}

export function getLastWicket(fallOfWickets) {
  return fallOfWickets.length ? fallOfWickets[fallOfWickets.length - 1] : null
}

/** Merges deliveries and non-scoring match events into one chronological feed for the timeline. */
export function getTimeline(innings) {
  return [
    ...innings.deliveries.map((d) => ({ kind: 'delivery', ...d })),
    ...innings.events.map((e) => ({ kind: 'event', ...e })),
  ].sort((a, b) => a.timestamp - b.timestamp)
}

/** Groups enriched deliveries by over for the Edit Score delivery browser, newest over first. */
export function groupDeliveriesByOver(deliveries) {
  const groups = new Map()
  for (const d of deliveries) {
    if (!groups.has(d.over)) groups.set(d.over, [])
    groups.get(d.over).push(d)
  }
  return [...groups.entries()].map(([over, overDeliveries]) => ({ over, deliveries: overDeliveries })).sort((a, b) => b.over - a.over)
}

/** Finds the id of the `bowler-change` event that set the bowler for a given over, so a bowler
 * correction can target that event rather than the (bowler-less) delivery entries themselves. */
export function findBowlerChangeEventForOver(events, overNumber) {
  const match = events.find((e) => e.event === 'bowler-change' && e.over === overNumber)
  return match ? match.id : null
}

/** Adapts enriched delivery records to the flat shape the existing WagonWheel/ShotLines components expect. */
export function selectWagonWheelShots(deliveries) {
  return deliveries
    .filter((d) => d.shot && !d.isDeadBall)
    .map((d) => ({
      id: d.id,
      x: d.shot.x,
      y: d.shot.y,
      region: d.shot.region,
      runs: d.totalRuns,
      outcome: d.wicket ? 'wicket' : 'runs',
    }))
}
