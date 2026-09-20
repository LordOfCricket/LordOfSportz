// Priority 3 — LOC Cricket Records (match & team records). Pure shaping over
// rows the repository already fetched with SQL joins; NO cricket derivation
// here (every runs/wickets/margin figure is an authoritative
// innings.runs / matches.result_margin value straight from the DB, the same
// columns tournamentAnalytics.service.js and the team record already trust).
// This is the batting-side/team-side counterpart to the per-player career
// leaderboards (leaderboardConfig.js) — never a second copy of them.

// How many entries each record category returns. Deliberately small — a
// "records" board is a short honour roll, not a paginated list.
export const CRICKET_RECORD_LIMIT = 5

function teamRef(id, name, shortName) {
  return id == null ? null : { id, name, shortName: shortName ?? null }
}

/**
 * A finalized-match row carrying both teams' identity plus winner_team_id →
 * { winner, loser } public team refs. Returns null when the match has no
 * single winner (TIE / NO_RESULT) or the winner id doesn't match either
 * listed team — the caller drops those rows rather than guessing.
 */
export function splitWinnerLoser(row) {
  if (row.winner_team_id == null) return null
  const teamA = teamRef(row.team_a_id, row.team_a_name, row.team_a_short)
  const teamB = teamRef(row.team_b_id, row.team_b_name, row.team_b_short)
  if (row.winner_team_id === row.team_a_id) return { winner: teamA, loser: teamB }
  if (row.winner_team_id === row.team_b_id) return { winner: teamB, loser: teamA }
  return null
}

/** innings row (batting/bowling team names joined) → a team-total record entry. */
export function mapInningsTotal(row) {
  return {
    runs: row.runs,
    wickets: row.wickets,
    legalBalls: row.legal_balls,
    team: teamRef(row.batting_team_id, row.batting_team_name, row.batting_team_short),
    opponent: teamRef(row.bowling_team_id, row.bowling_team_name, row.bowling_team_short),
    matchId: row.match_id,
    matchDate: row.match_date,
  }
}

/** matches row (both team names joined, SUM(innings.runs) as total_runs) → aggregate entry. */
export function mapMatchAggregate(row) {
  return {
    totalRuns: row.total_runs,
    teamA: teamRef(row.team_a_id, row.team_a_name, row.team_a_short),
    teamB: teamRef(row.team_b_id, row.team_b_name, row.team_b_short),
    matchId: row.match_id,
    matchDate: row.match_date,
  }
}

/**
 * matches row → a margin-of-victory entry. `marginUnit` is 'runs' or
 * 'wickets' (the caller already filtered by result_type, so this is not
 * inferred). Rows with no resolvable winner are dropped.
 */
export function mapVictoryMargin(row, marginUnit) {
  const split = splitWinnerLoser(row)
  if (!split) return null
  return {
    margin: row.result_margin,
    marginUnit,
    winner: split.winner,
    loser: split.loser,
    resultText: row.result ?? null,
    matchId: row.match_id,
    matchDate: row.match_date,
  }
}

/** 2nd-innings row where the batting side won → a run-chase record entry. */
export function mapSuccessfulChase(row) {
  return {
    runs: row.runs,
    wickets: row.wickets,
    legalBalls: row.legal_balls,
    chaser: teamRef(row.batting_team_id, row.batting_team_name, row.batting_team_short),
    defender: teamRef(row.bowling_team_id, row.bowling_team_name, row.bowling_team_short),
    matchId: row.match_id,
    matchDate: row.match_date,
  }
}

/** Assemble the full public Cricket Records DTO from the five raw row sets. */
export function buildCricketRecords(rows) {
  return {
    highestTeamTotals: rows.highestTeamTotals.map(mapInningsTotal),
    highestMatchAggregates: rows.highestMatchAggregates.map(mapMatchAggregate),
    biggestWinsByRuns: rows.biggestWinsByRuns.map((r) => mapVictoryMargin(r, 'runs')).filter(Boolean),
    biggestWinsByWickets: rows.biggestWinsByWickets.map((r) => mapVictoryMargin(r, 'wickets')).filter(Boolean),
    highestSuccessfulChases: rows.highestSuccessfulChases.map(mapSuccessfulChase),
  }
}
