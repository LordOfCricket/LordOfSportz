// Derived/presentation helpers over a replayInnings() result — all pure
// functions, ported from client/src/models/matchStats.model.js but
// parametrized by `ballsPerOver` instead of hardcoding 6 (Phase 3 requirement:
// balls-per-over must be server-configurable, default 6 for existing matches).
//
// Overs are NEVER represented as a float. `legalBalls` is the only stored
// count; over.ball is always `{ overs: floor(legalBalls/ballsPerOver),
// balls: legalBalls % ballsPerOver }`, formatted as "17.4" only for display.

export function formatOvers(legalBalls, ballsPerOver = 6) {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`
}

export function calculateRunRate(runs, legalBalls, ballsPerOver = 6) {
  if (!legalBalls) return 0
  return runs / (legalBalls / ballsPerOver)
}

export function getBallsRemaining(oversLimit, legalBalls, ballsPerOver = 6) {
  return Math.max(0, oversLimit * ballsPerOver - legalBalls)
}

export function calculateRequiredRunRate(target, runsScored, ballsRemaining, ballsPerOver = 6) {
  if (target == null || ballsRemaining <= 0) return null
  const runsNeeded = target - runsScored
  if (runsNeeded <= 0) return 0
  return runsNeeded / (ballsRemaining / ballsPerOver)
}

export function calculateProjectedScore(runs, legalBalls, oversLimit, ballsPerOver = 6) {
  if (!legalBalls) return null
  return Math.round((runs / (legalBalls / ballsPerOver)) * oversLimit)
}

export function getMatchPhase(overNumber, format) {
  const over = overNumber + 1
  const powerplayOvers = format?.powerplayOvers ?? 6
  const oversPerInnings = format?.oversPerInnings
  if (over <= powerplayOvers) return 'Powerplay'
  if (oversPerInnings != null && over > oversPerInnings - 5) return 'Death Overs'
  return 'Middle Overs'
}

export function getCurrentOverDeliveries(deliveries, overNumber) {
  return deliveries.filter((d) => d.over === overNumber + 1)
}

export function getLast5OversStats(deliveries, currentOverNumber, ballsPerOver = 6) {
  const fromOver = Math.max(1, currentOverNumber - 4)
  const relevant = deliveries.filter((d) => d.over >= fromOver && d.over <= currentOverNumber + 1 && !d.isDeadBall)
  const runs = relevant.reduce((sum, d) => sum + d.totalRuns, 0)
  const wickets = relevant.filter((d) => d.wicket).length
  const legalBalls = relevant.filter((d) => d.isLegalDelivery).length
  return { runs, wickets, runRate: calculateRunRate(runs, legalBalls, ballsPerOver) }
}

export function getLastWicket(fallOfWickets) {
  return fallOfWickets.length ? fallOfWickets[fallOfWickets.length - 1] : null
}

/** Merges deliveries and non-scoring events into one chronological feed, ordered by log_sequence (never by timestamp). */
export function getTimeline(innings) {
  return [
    ...innings.deliveries.map((d) => ({ kind: 'delivery', ...d })),
    ...innings.events.map((e) => ({ kind: 'event', ...e })),
  ].sort((a, b) => a.logSequence - b.logSequence)
}

/** Groups enriched deliveries by over, newest over first — for a delivery browser / Edit Score list. */
export function groupDeliveriesByOver(deliveries) {
  const groups = new Map()
  for (const d of deliveries) {
    if (!groups.has(d.over)) groups.set(d.over, [])
    groups.get(d.over).push(d)
  }
  return [...groups.entries()].map(([over, overDeliveries]) => ({ over, deliveries: overDeliveries })).sort((a, b) => b.over - a.over)
}

export function selectWagonWheelShots(deliveries, shotsByDeliveryId) {
  return deliveries
    // Phase 4 (Umpire Module) — a void-only correction (correction.service.js's
    // applyCorrection) only deletes a delivery's shot row when `shot` is
    // explicitly part of the patch, so a delivery voided without also
    // clearing its shot can leave a stale row in wagon_wheel_shots. Excluding
    // `voided` here (same reasoning as the existing `isDeadBall` exclusion —
    // neither should ever visually count as a real shot) is the minimal fix:
    // it can never render regardless of whether the write side left a stale
    // row behind.
    .filter((d) => shotsByDeliveryId.has(d.id) && !d.isDeadBall && !d.voided)
    .map((d) => {
      const shot = shotsByDeliveryId.get(d.id)
      return {
        deliveryId: d.id,
        strikerMatchPlayerId: d.strikerMatchPlayerId,
        x: shot.normalized_x,
        y: shot.normalized_y,
        region: shot.region_id,
        runs: d.totalRuns,
        outcome: d.wicket ? 'wicket' : 'runs',
      }
    })
}
