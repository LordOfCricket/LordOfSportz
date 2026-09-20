// Centralized cricket-domain validation. Pure — takes already-loaded context
// (current replayed state, the match-player roster, match/innings status) and
// either returns normally or throws a ScoringError with a structured code.
// Nothing here trusts frontend-supplied ids without checking them against the
// match_players set loaded by the repository layer.

import { ScoringError, SCORING_ERROR_CODES as CODES } from './errors.js'
import { getAllowedDismissals } from './replay.js'
import { WAGON_WHEEL_REGION_IDS } from './wagonWheelRegions.js'

function fail(code, message, details) {
  throw new ScoringError(code, message, details)
}

/**
 * @param {object} params
 * @param {object} params.input - delivery input (batRuns, illegal, extra, wicket, shot, isDeadBall, bowlerMatchPlayerId, swapStrikerNonStriker)
 * @param {object} params.state - result of replayInnings() over the log BEFORE this delivery
 * @param {Map} params.matchPlayersById - Map<matchPlayerId, { teamId, playerId }> for this match
 * @param {string} params.battingTeamId
 * @param {string} params.bowlingTeamId
 * @param {string} params.inningsStatus
 * @param {boolean} [params.allowCompleted] - Phase 6: correction.service.js sets
 *   this true — a 'completed' (not yet 'finalized') innings is still open to
 *   authorized historical correction, only live *recording* requires 'live'.
 */
export function validateDeliveryInput({ input, state, matchPlayersById, battingTeamId, bowlingTeamId, inningsStatus, allowCompleted = false }) {
  const statusAllowed = inningsStatus === 'live' || (allowCompleted && inningsStatus === 'completed')
  if (!statusAllowed) {
    fail(CODES.INVALID_INNINGS_STATE, `Cannot record a delivery while innings status is '${inningsStatus}'.`, { inningsStatus })
  }

  if (state.pendingBatsmanSelection) {
    fail(CODES.INVALID_STRIKER_STATE, `A batsman must be selected for ${state.pendingBatsmanSelection} before recording another delivery.`, {
      pendingBatsmanSelection: state.pendingBatsmanSelection,
    })
  }

  const bowler = matchPlayersById.get(input.bowlerMatchPlayerId)
  if (!bowler) {
    fail(CODES.INVALID_MATCH_PLAYER, 'Bowler does not belong to this match.', { matchPlayerId: input.bowlerMatchPlayerId })
  }
  if (bowler.teamId !== bowlingTeamId) {
    fail(CODES.INVALID_BOWLER, 'Bowler must belong to the bowling team.', { matchPlayerId: input.bowlerMatchPlayerId })
  }
  const isFirstBallOfOver = state.legalBalls % (state.ballsPerOver || 6) === 0
  if (isFirstBallOfOver && state.previousOverBowlerId && input.bowlerMatchPlayerId === state.previousOverBowlerId) {
    fail(CODES.INVALID_BOWLER, 'The same bowler cannot bowl two overs in a row.', { matchPlayerId: input.bowlerMatchPlayerId })
  }

  const batRuns = input.batRuns || 0
  if (!Number.isInteger(batRuns) || batRuns < 0 || batRuns > 6) {
    fail(CODES.INVALID_RUN_CONFIGURATION, 'batRuns must be an integer between 0 and 6.', { batRuns })
  }

  if (input.illegal) {
    if (!['wide', 'no-ball'].includes(input.illegal.type)) {
      fail(CODES.INVALID_EXTRA_CONFIGURATION, 'illegal.type must be wide or no-ball.', { illegal: input.illegal })
    }
    if (input.illegal.type === 'wide') {
      if (batRuns > 0) fail(CODES.INVALID_RUN_CONFIGURATION, 'A wide cannot carry bat runs.', { input })
      if (input.extra) fail(CODES.INVALID_EXTRA_CONFIGURATION, 'A wide cannot carry byes/leg-byes.', { input })
      if (!Number.isInteger(input.illegal.runs) || input.illegal.runs < 1) {
        fail(CODES.INVALID_EXTRA_CONFIGURATION, 'wide runs must be an integer >= 1.', { illegal: input.illegal })
      }
    }
    if (input.illegal.type === 'no-ball') {
      if (input.illegal.runs !== 1) {
        fail(CODES.INVALID_EXTRA_CONFIGURATION, 'no-ball illegal.runs must be exactly 1 (the flat penalty); bat/bye runs are separate fields.', {
          illegal: input.illegal,
        })
      }
      if (batRuns > 0 && input.extra) {
        fail(CODES.INVALID_EXTRA_CONFIGURATION, 'A no-ball can carry bat runs OR byes/leg-byes, never both.', { input })
      }
    }
  }

  if (input.extra) {
    if (!['bye', 'leg-bye'].includes(input.extra.type)) {
      fail(CODES.INVALID_EXTRA_CONFIGURATION, 'extra.type must be bye or leg-bye.', { extra: input.extra })
    }
    if (input.illegal?.type === 'wide') {
      fail(CODES.INVALID_EXTRA_CONFIGURATION, 'A wide cannot carry byes/leg-byes.', { input })
    }
    if (batRuns > 0) {
      fail(CODES.INVALID_RUN_CONFIGURATION, 'A delivery cannot have both bat runs and byes/leg-byes.', { input })
    }
    if (!Number.isInteger(input.extra.runs) || input.extra.runs < 0) {
      fail(CODES.INVALID_EXTRA_CONFIGURATION, 'extra.runs must be a non-negative integer.', { extra: input.extra })
    }
  }

  if (input.wicket) {
    const allowed = getAllowedDismissals(state, input.illegal)
    if (!allowed.includes(input.wicket.type)) {
      fail(CODES.INVALID_WICKET_COMBINATION, `Dismissal type '${input.wicket.type}' is not allowed on this delivery.`, {
        wicketType: input.wicket.type,
        allowed,
      })
    }

    if (input.wicket.type === 'run-out') {
      const dismissedId = input.wicket.dismissedMatchPlayerId
      const validEnds = [state.ends.strikerEnd, state.ends.nonStrikerEnd].filter(Boolean)
      if (!dismissedId || !validEnds.includes(dismissedId)) {
        fail(CODES.INVALID_DISMISSED_PLAYER, 'run-out dismissedMatchPlayerId must be the current striker or non-striker.', {
          dismissedMatchPlayerId: dismissedId,
          validEnds,
        })
      }
    } else if (input.wicket.dismissedMatchPlayerId) {
      // Every other dismissal type always attributes to the current striker —
      // it's derived, not scorer-chosen. Reject an explicit value so the API
      // never silently ignores conflicting caller input.
      fail(CODES.INVALID_WICKET_COMBINATION, `dismissedMatchPlayerId must not be supplied for dismissal type '${input.wicket.type}' — it is always the current striker.`, {
        wicket: input.wicket,
      })
    }

    const strikerStat = state.batsmen[state.ends.strikerEnd]
    if (strikerStat?.out) {
      fail(CODES.PLAYER_ALREADY_DISMISSED, 'The current striker is already recorded as dismissed.', { matchPlayerId: state.ends.strikerEnd })
    }

    for (const fielderId of [input.wicket.fielderMatchPlayerId, input.wicket.secondaryFielderMatchPlayerId].filter(Boolean)) {
      const fielder = matchPlayersById.get(fielderId)
      if (!fielder) fail(CODES.INVALID_MATCH_PLAYER, 'Fielder does not belong to this match.', { matchPlayerId: fielderId })
      if (fielder.teamId !== bowlingTeamId) fail(CODES.INVALID_MATCH_PLAYER, 'Fielder must belong to the bowling team.', { matchPlayerId: fielderId })
    }
  }

  if (input.shot) {
    const { normalizedX, normalizedY, angleDegrees, regionId } = input.shot
    if (typeof normalizedX !== 'number' || normalizedX < -1 || normalizedX > 1) fail(CODES.INVALID_WAGON_WHEEL, 'normalizedX must be between -1 and 1.', { shot: input.shot })
    if (typeof normalizedY !== 'number' || normalizedY < -1 || normalizedY > 1) fail(CODES.INVALID_WAGON_WHEEL, 'normalizedY must be between -1 and 1.', { shot: input.shot })
    if (typeof angleDegrees !== 'number' || angleDegrees < 0 || angleDegrees >= 360) fail(CODES.INVALID_WAGON_WHEEL, 'angleDegrees must be between 0 and 360.', { shot: input.shot })
    if (!WAGON_WHEEL_REGION_IDS.includes(regionId)) fail(CODES.INVALID_WAGON_WHEEL, 'Unknown wagon wheel region.', { shot: input.shot })
  }
}

/**
 * @param {object} params
 * @param {object} params.event - { eventType, payload }
 * @param {object} params.state - result of replayInnings() over the log BEFORE this event
 * @param {Map} params.matchPlayersById
 * @param {string} params.battingTeamId
 * @param {string} params.bowlingTeamId
 * @param {string} params.inningsStatus
 * @param {boolean} [params.allowCompleted] - see validateDeliveryInput.
 */
export function validateEventInput({ event, state, matchPlayersById, battingTeamId, bowlingTeamId, inningsStatus, allowCompleted = false }) {
  if (inningsStatus === 'forfeited' || (inningsStatus === 'completed' && !allowCompleted)) {
    fail(CODES.INVALID_INNINGS_STATE, `Cannot record an event while innings status is '${inningsStatus}'.`, { inningsStatus })
  }

  const { eventType, payload = {} } = event

  function requireMatchPlayer(id, mustBelongToTeamId, label) {
    const mp = matchPlayersById.get(id)
    if (!mp) fail(CODES.INVALID_MATCH_PLAYER, `${label} does not belong to this match.`, { matchPlayerId: id })
    if (mustBelongToTeamId && mp.teamId !== mustBelongToTeamId) {
      fail(CODES.INVALID_MATCH_PLAYER, `${label} must belong to the expected team.`, { matchPlayerId: id, expectedTeamId: mustBelongToTeamId })
    }
    return mp
  }

  switch (eventType) {
    case 'batsman-in':
      if (!['strikerEnd', 'nonStrikerEnd'].includes(payload.end)) fail(CODES.INVALID_STRIKER_STATE, 'end must be strikerEnd or nonStrikerEnd.', { payload })
      requireMatchPlayer(payload.matchPlayerId, battingTeamId, 'Incoming batsman')
      break
    case 'bowler-change':
      requireMatchPlayer(payload.matchPlayerId, bowlingTeamId, 'Bowler')
      break
    case 'retire':
      requireMatchPlayer(payload.matchPlayerId, battingTeamId, 'Retiring batsman')
      break
    case 'penalty-runs':
      if (!Number.isInteger(payload.runs) || payload.runs <= 0) fail(CODES.INVALID_RUN_CONFIGURATION, 'penalty-runs payload.runs must be a positive integer.', { payload })
      if (!['batting', 'fielding'].includes(payload.awardedTo)) fail(CODES.INVALID_RUN_CONFIGURATION, 'penalty-runs payload.awardedTo must be batting or fielding.', { payload })
      break
    case 'catch-dropped':
      if (payload.fielderMatchPlayerId) requireMatchPlayer(payload.fielderMatchPlayerId, bowlingTeamId, 'Fielder')
      break
    case 'strike-swap':
    case 'fielding-event':
    case 'appeal':
    case 'review':
    case 'drinks-break':
    case 'rain-delay':
    case 'injury':
    case 'match-paused':
    case 'match-resumed':
      break
    default:
      fail(CODES.INVALID_EVENT_TYPE, `Unknown event type '${eventType}'.`, { eventType })
  }
}
