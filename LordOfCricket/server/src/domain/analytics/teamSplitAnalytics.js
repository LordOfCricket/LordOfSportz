// Phase 17 — batting-first vs. chasing record. `matchRows`: [{battingFirst: boolean, won: boolean|null}],
// where `battingFirst` is derived by the caller from the ACTUAL innings_number=1 batting_team_id
// (never assumed from team_a_id/team_b_id column order — Part 18).

function summarize(rows) {
  const wins = rows.filter((m) => m.won === true).length
  return { matches: rows.length, wins, winPercentage: rows.length > 0 ? (wins / rows.length) * 100 : null }
}

export function computeBattingFirstVsChasing(matchRows) {
  return {
    battingFirst: summarize(matchRows.filter((m) => m.battingFirst)),
    chasing: summarize(matchRows.filter((m) => !m.battingFirst)),
  }
}
