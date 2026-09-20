// Pure result derivation — given the two innings' authoritative final totals,
// decide who won and by how much. Never called until innings 2 has actually
// finished (all out / overs complete / target chased); never guesses.
//
// Wickets-remaining margin is roster-size-aware (LOC supports non-11-a-side
// local matches) — "all out" for an N-player batting side is N-1 wickets down,
// so remaining wickets is (N - 1 - wicketsLost), never a hardcoded (10 - w).

export const RESULT_TYPES = Object.freeze(['WICKETS', 'RUNS', 'TIE'])

export function allOutThreshold(battingTeamPlayingXiCount) {
  return battingTeamPlayingXiCount != null ? battingTeamPlayingXiCount - 1 : 10
}

/**
 * @param {object} innings1 - { battingTeamId, runs }
 * @param {object} innings2 - { battingTeamId, runs, wickets, battingTeamPlayingXiCount }
 */
export function deriveMatchResult(innings1, innings2) {
  const target = innings1.runs + 1

  if (innings2.runs >= target) {
    const wicketsRemaining = allOutThreshold(innings2.battingTeamPlayingXiCount) - innings2.wickets
    return {
      winnerTeamId: innings2.battingTeamId,
      resultType: 'WICKETS',
      resultMargin: Math.max(wicketsRemaining, 0),
      resultText: `Won by ${Math.max(wicketsRemaining, 0)} wicket${wicketsRemaining === 1 ? '' : 's'}`,
    }
  }

  if (innings2.runs < innings1.runs) {
    const margin = innings1.runs - innings2.runs
    return {
      winnerTeamId: innings1.battingTeamId,
      resultType: 'RUNS',
      resultMargin: margin,
      resultText: `Won by ${margin} run${margin === 1 ? '' : 's'}`,
    }
  }

  // innings2.runs === innings1.runs (can't exceed target here — reaching
  // target is the WICKETS branch above, since target = innings1.runs + 1).
  return { winnerTeamId: null, resultType: 'TIE', resultMargin: 0, resultText: 'Match tied' }
}
