// Phase 10 Part 2 — pure team win/loss/tie record derivation. No pg, no I/O.
// Consumes a list of FINALIZED matches this team played (caller's
// responsibility, same "caller filters, this function folds" contract as
// battingStats.js#aggregateBatting) — Phase 7's one hard rule (official stats
// = finalized-only) applies identically here (Part 18/93).
//
// Win % denominator is EVERY eligible (finalized) match, ties/no-results
// included — the simple, unsurprising convention for a club scoreboard
// (Part 24, documented deliberately, not silently chosen).

export function buildTeamRecord(finalizedMatches, teamId) {
  let wins = 0
  let losses = 0
  let ties = 0
  let noResults = 0

  for (const m of finalizedMatches) {
    if (m.result_type === 'NO_RESULT') {
      noResults += 1
    } else if (m.result_type === 'TIE') {
      ties += 1
    } else if (m.winner_team_id === teamId) {
      wins += 1
    } else {
      losses += 1
    }
  }

  const matches = finalizedMatches.length
  return {
    matches,
    wins,
    losses,
    ties,
    noResults,
    winPercentage: matches > 0 ? (wins / matches) * 100 : null,
  }
}

function resultLetter(m, teamId) {
  if (m.result_type === 'NO_RESULT') return 'NR'
  if (m.result_type === 'TIE') return 'T'
  return m.winner_team_id === teamId ? 'W' : 'L'
}

/** Newest-first (Part 25, documented — matches Phase 10 Part 1's RESULTS
 * category convention of "most recent first"). `finalizedMatches` may be
 * given in any order; this sorts defensively rather than trusting caller order. */
export function buildRecentForm(finalizedMatches, teamId, count = 5) {
  return finalizedMatches
    .slice()
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date) || b.match_id - a.match_id)
    .slice(0, count)
    .map((m) => ({ matchId: m.match_id, result: resultLetter(m, teamId) }))
}
