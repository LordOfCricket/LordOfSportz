// Phase 17 — team vs. team historical record. `matchRows` must already be
// scoped to finalized matches between exactly these two teams' HISTORICAL
// team_a_id/team_b_id (a team's own identity never changes — only player
// membership transfers, which is irrelevant here — Part 36).

export function computeHeadToHead(matchRows, teamAId, teamBId, recentCount = 5) {
  let teamAWins = 0
  let teamBWins = 0
  let ties = 0
  let noResults = 0

  for (const m of matchRows) {
    if (m.result_type === 'TIE') ties += 1
    else if (m.result_type === 'NO_RESULT') noResults += 1
    else if (m.winner_team_id === teamAId) teamAWins += 1
    else if (m.winner_team_id === teamBId) teamBWins += 1
  }

  const recentMeetings = matchRows
    .slice()
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date) || b.id - a.id)
    .slice(0, recentCount)
    .map((m) => ({ matchId: m.id, date: m.match_date, winnerTeamId: m.winner_team_id, resultType: m.result_type, resultMargin: m.result_margin }))

  return { matchesPlayed: matchRows.length, teamAWins, teamBWins, ties, noResults, recentMeetings }
}
