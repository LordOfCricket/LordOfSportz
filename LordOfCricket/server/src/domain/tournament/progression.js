// Knockout progression rules (Part 25/32/33/35/36) — pure decision logic,
// no I/O. The service layer feeds this the linked match's authoritative
// result plus any staff manual-resolution override; this module only ever
// decides "resolved or not, and who won" — it never writes anything.

/**
 * @param {object} fixtureResult
 *   matchStatus: the linked match's `status` ('upcoming'|'live'|'completed'|'finalized'), or null if no match linked yet
 *   resultType: 'RUNS'|'WICKETS'|'TIE'|'NO_RESULT'|null
 *   winnerTeamId: number|null
 *   manualWinnerTeamId: number|null — staff override (Part 35/36)
 */
export function isFixtureResolved(fixtureResult) {
  if (fixtureResult.manualWinnerTeamId != null) return true
  if (fixtureResult.matchStatus !== 'finalized') return false
  // A finalized TIE or NO_RESULT never auto-resolves — Part 35/36: LOC has no
  // authoritative Super Over/tie-break engine, so no winner is ever invented.
  if (fixtureResult.resultType === 'TIE' || fixtureResult.resultType === 'NO_RESULT' || fixtureResult.resultType == null) return false
  return fixtureResult.winnerTeamId != null
}

export function winnerOf(fixtureResult) {
  if (fixtureResult.manualWinnerTeamId != null) return fixtureResult.manualWinnerTeamId
  if (!isFixtureResolved(fixtureResult)) return null
  return fixtureResult.winnerTeamId
}

/** True only when every fixture in the round is resolved — a round only
 * ever advances as a whole (Part 32/33), never partially. */
export function isRoundComplete(fixtureResults) {
  return fixtureResults.length > 0 && fixtureResults.every(isFixtureResolved)
}
