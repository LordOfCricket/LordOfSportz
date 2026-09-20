// Deterministic wicket prose (Part 10) — only the dismissal types LOC's
// schema actually supports (domain/scoring/eventTypes.js#DISMISSAL_TYPES).
// Fielder identity is only ever named when authoritatively recorded
// (wickets.fielder_match_player_id) — never guessed.

/**
 * @param {object} params
 * @param {object} params.delivery
 * @param {object} params.wicket - { type, fielderMatchPlayerId, secondaryFielderMatchPlayerId, ... }
 * @param {{name:string}|null} params.dismissedPlayer
 * @param {{name:string}|null} params.bowler
 * @param {{name:string}|null} params.fielder
 * @param {{name:string}|null} params.secondaryFielder
 * @returns {{ text: string, tags: string[] } | null}
 */
export function buildWicketCommentary({ delivery, wicket, dismissedPlayer, bowler, fielder, secondaryFielder }) {
  if (delivery.voided || delivery.isDeadBall) return null

  const out = dismissedPlayer?.name || 'The batsman'
  const bowlerName = bowler?.name || 'the bowler'
  const fielderName = fielder?.name || null
  const secondaryFielderName = secondaryFielder?.name || null

  switch (wicket.type) {
    case 'bowled':
      return { text: `WICKET! ${out} is bowled by ${bowlerName}.`, tags: ['WICKET', 'BOWLED'] }
    case 'lbw':
      return { text: `WICKET! ${out} is trapped LBW by ${bowlerName}.`, tags: ['WICKET', 'LBW'] }
    case 'caught':
      return {
        text: fielderName ? `WICKET! ${out} is caught by ${fielderName} off ${bowlerName}.` : `WICKET! ${out} is caught off ${bowlerName}.`,
        tags: ['WICKET', 'CAUGHT'],
      }
    case 'stumped':
      return {
        text: fielderName ? `WICKET! ${out} is stumped by ${fielderName} off ${bowlerName}.` : `WICKET! ${out} is stumped off ${bowlerName}.`,
        tags: ['WICKET', 'STUMPED'],
      }
    case 'run-out': {
      const throwers = [fielderName, secondaryFielderName].filter(Boolean)
      return {
        text: throwers.length ? `WICKET! ${out} is run out, ${throwers.join(' to ')} involved.` : `WICKET! ${out} is run out.`,
        tags: ['WICKET', 'RUN_OUT'],
      }
    }
    case 'hit-wicket':
      return { text: `WICKET! ${out} is out hit wicket off ${bowlerName}.`, tags: ['WICKET', 'HIT_WICKET'] }
    case 'obstructing-field':
      return { text: `WICKET! ${out} is out, obstructing the field.`, tags: ['WICKET'] }
    case 'hit-ball-twice':
      return { text: `WICKET! ${out} is out, hit the ball twice.`, tags: ['WICKET'] }
    case 'timed-out':
      return { text: `WICKET! ${out} is timed out.`, tags: ['WICKET'] }
    case 'retired-out':
      return { text: `${out} is retired out.`, tags: ['WICKET'] }
    default:
      return { text: `WICKET! ${out} is out.`, tags: ['WICKET'] }
  }
}
