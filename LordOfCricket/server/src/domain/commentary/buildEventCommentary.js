// Deterministic prose for the small subset of match_events that are worth a
// spectator commentary line (Part 11) — catch-dropped, retire, penalty-runs.
// The rest (batsman-in, bowler-change, strike-swap, appeal, review,
// drinks-break, rain-delay, injury, match-paused/resumed) are administrative/
// mechanical and deliberately produce no commentary row (Part 6: a small,
// meaningful taxonomy, not one line per possible event).

/**
 * @param {object} params
 * @param {object} params.event - { eventType, payload }
 * @param {{name:string}|null} params.batsman - the current striker at the time of the event, where relevant
 * @param {{name:string}|null} params.fielder
 * @returns {{ text: string, tags: string[] } | null}
 */
export function buildEventCommentary({ event, batsman, fielder }) {
  if (event.voided) return null

  switch (event.eventType) {
    case 'catch-dropped': {
      const fielderName = fielder?.name || null
      const off = batsman?.name ? ` off ${batsman.name}` : ''
      return { text: fielderName ? `Dropped! ${fielderName} puts down the chance${off}.` : `Dropped! A chance goes down${off}.`, tags: ['DROPPED_CATCH'] }
    }
    case 'retire': {
      const name = batsman?.name || 'The batsman'
      const hurt = event.payload?.type === 'retired-hurt'
      return { text: `${name} retires${hurt ? ' hurt' : ''}.`, tags: ['RETIRED'] }
    }
    case 'penalty-runs': {
      const runs = event.payload?.runs ?? 0
      const side = event.payload?.awardedTo === 'batting' ? 'batting' : 'fielding'
      return { text: `Penalty! ${runs} run${runs === 1 ? '' : 's'} awarded to the ${side} side.`, tags: ['PENALTY'] }
    }
    default:
      return null
  }
}
