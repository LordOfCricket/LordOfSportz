// Centralized points policy (Part 24) — nowhere else in the codebase
// hardcodes these numbers. Not user-configurable in V1 (spec: "keep them
// centralized but not user-configurable").

export const TOURNAMENT_POINTS = Object.freeze({
  WIN: 2,
  TIE: 1,
  NO_RESULT: 1,
  LOSS: 0,
})

/**
 * @param {'RUNS'|'WICKETS'|'TIE'|'NO_RESULT'} resultType
 * @param {boolean} isWinner - only meaningful when resultType is RUNS/WICKETS
 */
export function pointsForResult(resultType, isWinner) {
  if (resultType === 'TIE') return TOURNAMENT_POINTS.TIE
  if (resultType === 'NO_RESULT') return TOURNAMENT_POINTS.NO_RESULT
  return isWinner ? TOURNAMENT_POINTS.WIN : TOURNAMENT_POINTS.LOSS
}
