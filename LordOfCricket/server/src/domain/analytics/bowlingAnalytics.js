// Phase 17 — bowling dot-ball percentage. The dot COUNT itself is never
// recomputed here: replay.js's updateBowler already tracks
// state.bowlers[matchPlayerId].dots using the one authoritative definition
// (`totalRuns === 0 && !wicket`) — this file only turns that trusted count
// into a percentage, exactly like bowlingEconomy/battingStrikeRate's existing
// null-for-zero-balls convention.

export function bowlingDotBallPercentage(dots, legalBalls) {
  if (!legalBalls) return null
  return (dots / legalBalls) * 100
}
