// Professional scorecard dismissal text — pure string formatting over
// ALREADY-RESOLVED facts (wicket.type + player names). Never fabricates a
// fielder/keeper name that isn't authoritatively recorded (Phase 9 Part 11):
// if fielderName is null, the format falls back to the shorter, still-honest
// phrasing rather than guessing.

/**
 * @param {object} wicket - { type, fielderName, secondaryFielderName }
 * @param {string} bowlerName
 */
export function formatDismissalText(wicket, bowlerName) {
  const { type, fielderName, secondaryFielderName } = wicket
  switch (type) {
    case 'bowled':
      return `b ${bowlerName}`
    case 'lbw':
      return `lbw b ${bowlerName}`
    case 'hit-wicket':
      return `hit wicket b ${bowlerName}`
    case 'caught':
      if (!fielderName) return `c b ${bowlerName}`
      if (fielderName === bowlerName) return `c & b ${bowlerName}`
      return `c ${fielderName} b ${bowlerName}`
    case 'stumped':
      return fielderName ? `st ${fielderName} b ${bowlerName}` : `stumped b ${bowlerName}`
    case 'run-out': {
      const fielders = [fielderName, secondaryFielderName].filter(Boolean)
      return fielders.length ? `run out (${fielders.join('/')})` : 'run out'
    }
    case 'obstructing-field':
      return 'obstructing the field'
    case 'hit-ball-twice':
      return 'hit the ball twice'
    case 'timed-out':
      return 'timed out'
    case 'retired-out':
      return 'retired out'
    default:
      return type
  }
}
