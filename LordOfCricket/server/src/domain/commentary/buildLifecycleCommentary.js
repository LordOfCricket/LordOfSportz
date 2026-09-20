// Deterministic lifecycle prose (Part 17/23/24/25/26) — over-end, innings
// end/break, second-innings start, match result. Every number here is read
// from already-authoritative replay/match state, never recomputed (Part 26:
// the match RESULT text always comes from matches.result, not a local
// re-derivation of who won).

export function buildOverEndText(overNumber, battingTeamName, runs, wickets) {
  return `End of the over — ${battingTeamName} ${runs}/${wickets} after ${overNumber} over${overNumber === 1 ? '' : 's'}.`
}

export function buildMaidenText(bowlerName) {
  return `Maiden over from ${bowlerName}.`
}

export function buildInningsEndText(battingTeamName, runs, wickets, isAllOut) {
  return isAllOut ? `${battingTeamName} are all out for ${runs}.` : `Innings complete — ${battingTeamName} finish on ${runs}/${wickets}.`
}

export function buildInningsBreakText(chasingTeamName, target) {
  return `Innings break. ${chasingTeamName} need ${target} to win.`
}

export function buildInningsStartText(chasingTeamName, target) {
  return `${chasingTeamName} begin the chase. Target: ${target}.`
}

export function buildMatchResultText(resultText) {
  return resultText || 'Match complete.'
}
