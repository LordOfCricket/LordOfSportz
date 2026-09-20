// Phase 17 — Advanced Cricket Analytics data access. Every query here is
// either a cheap SQL aggregate over already-authoritative cache columns
// (innings.runs/wickets/legal_balls — the same replay-written cache columns
// scoring.service.js already trusts, schema.sql's Phase 3 comment) or a small
// lookup — never a per-row loop from application code (Part 46). Bounded
// per-innings replay (where genuinely needed for ball-level detail like
// dot-balls/boundaries/phases) happens in the service layer via the SAME
// scoring.service.js#getInningsState every other read model already uses.

import { pool } from '../config/db.js'

/** Every wicket where this match_player was the one dismissed, across finalized, non-voided deliveries — the authoritative dismissal_type breakdown (Part 15). */
export async function listDismissalsForMatchPlayers(matchPlayerIds, client = pool) {
  if (matchPlayerIds.length === 0) return []
  const { rows } = await client.query(
    `SELECT w.dismissal_type
     FROM wickets w
     JOIN deliveries d ON d.id = w.delivery_id
     JOIN innings i ON i.id = d.innings_id
     JOIN matches m ON m.id = i.match_id
     WHERE m.status = 'finalized' AND d.voided = false AND w.dismissed_match_player_id = ANY($1)`,
    [matchPlayerIds]
  )
  return rows
}

/**
 * One row per innings of every FINALIZED match this team played (either
 * side), using the innings table's own replay-written cache columns — no
 * replay call needed for these aggregate metrics (average score/conceded,
 * batting-first vs chasing, run-rate trend, structured recent form all derive
 * from this single query). `battingFirst`/`won`/`opponentTeamId` are computed
 * here so the service layer never has to re-derive them per row.
 */
export async function listTeamInningsForFinalizedMatches(teamId, client = pool) {
  const { rows } = await client.query(
    `SELECT m.id AS match_id, m.match_date, m.balls_per_over, m.overs_per_innings,
            m.winner_team_id, m.result_type, m.result_margin, m.team_a_id, m.team_b_id,
            ta.name AS team_a_name, tb.name AS team_b_name,
            i.innings_number, i.batting_team_id, i.bowling_team_id, i.runs, i.wickets, i.legal_balls
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     JOIN innings i ON i.match_id = m.id
     WHERE m.status = 'finalized' AND (m.team_a_id = $1 OR m.team_b_id = $1)
     ORDER BY m.match_date DESC, m.id DESC, i.innings_number ASC`,
    [teamId]
  )
  return rows
}

/** Every FINALIZED match played between exactly these two teams' historical team_a_id/team_b_id (Part 36 — never current squad membership). */
export async function listHeadToHeadMatches(teamAId, teamBId, client = pool) {
  const { rows } = await client.query(
    `SELECT id, match_date, winner_team_id, result_type, result_margin
     FROM matches
     WHERE status = 'finalized'
       AND ((team_a_id = $1 AND team_b_id = $2) OR (team_a_id = $2 AND team_b_id = $1))
     ORDER BY match_date DESC, id DESC`,
    [teamAId, teamBId]
  )
  return rows
}

/**
 * Every finalized innings of a tournament, WITH innings_number (unlike
 * tournament.repository.js#listFinalizedTournamentInnings, which omits it —
 * that function's own callers, standings/NRR, never need to distinguish
 * innings 1 from innings 2). A parallel, additive query here — rather than
 * changing that Phase 15, test-covered function's SELECT list — for the
 * "average FIRST-innings score" metric (Part 19/37), which does need it.
 */
export async function listFinalizedTournamentInningsDetailed(tournamentId, client = pool) {
  const { rows } = await client.query(
    `SELECT i.match_id, i.innings_number, i.batting_team_id, i.bowling_team_id, i.runs, i.wickets, i.legal_balls
     FROM innings i
     JOIN tournament_fixtures f ON f.match_id = i.match_id
     JOIN matches m ON m.id = i.match_id
     WHERE f.tournament_id = $1 AND m.status = 'finalized'`,
    [tournamentId]
  )
  return rows
}

/** Every tournament this team registered in, for the Team Tournament Performance section (Part 22). */
export async function listTournamentsForTeam(teamId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id, t.public_tournament_id, t.name, t.format, t.status, t.champion_team_id
     FROM tournament_teams tt
     JOIN tournaments t ON t.id = tt.tournament_id
     WHERE tt.team_id = $1
     ORDER BY t.start_date DESC, t.id DESC`,
    [teamId]
  )
  return rows
}

// Priority 2 — Player Head-to-Head. Real batter-vs-bowler ENCOUNTERS
// (never career totals): finalized matches where both players' match_players
// rows exist, then a pure aggregate over the ball-by-ball `deliveries`
// (indexed on striker_match_player_id / bowler_match_player_id) + `wickets`.
// No replay pass, no N+1 — every number is a SUM/COUNT the DB already has
// the columns for. Balls-faced convention matches replay.js exactly (a wide
// is never a ball faced, a no-ball is); runs-conceded excludes byes/leg-byes
// (extra_runs) but keeps wide/no-ball extras, mirroring bowlingStats.js.

/** The finalized matches where BOTH players appeared, newest first, with the
 * team each player represented in that match. */
export async function listSharedFinalizedMatches(playerIdA, playerIdB, client = pool) {
  const { rows } = await client.query(
    `SELECT m.id AS match_id, m.match_date, m.winner_team_id, m.result_type, m.result_margin, m.result,
            ta.id AS team_a_id, ta.name AS team_a_name,
            tb.id AS team_b_id, tb.name AS team_b_name,
            mpa.team_id AS player_a_team_id, mpb.team_id AS player_b_team_id
     FROM matches m
     JOIN match_players mpa ON mpa.match_id = m.id AND mpa.player_id = $1
     JOIN match_players mpb ON mpb.match_id = m.id AND mpb.player_id = $2
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.status = 'finalized'
     ORDER BY m.match_date DESC, m.id DESC`,
    [playerIdA, playerIdB]
  )
  return rows
}

/**
 * One aggregate row for every delivery in the shared finalized matches where
 * `strikerPlayerId` faced `bowlerPlayerId`. Returns BOTH a batting view (for
 * the striker) and a bowling view (for the bowler) over the same ball set.
 */
export async function aggregateHeadToHeadDeliveries(strikerPlayerId, bowlerPlayerId, client = pool) {
  const { rows } = await client.query(
    `WITH shared AS (
       SELECT m.id AS match_id, mps.id AS striker_mp, mpb.id AS bowler_mp
       FROM matches m
       JOIN match_players mps ON mps.match_id = m.id AND mps.player_id = $1
       JOIN match_players mpb ON mpb.match_id = m.id AND mpb.player_id = $2
       WHERE m.status = 'finalized'
     ),
     d AS (
       SELECT del.*, m.balls_per_over
       FROM shared s
       JOIN matches m ON m.id = s.match_id
       JOIN innings i ON i.match_id = s.match_id
       JOIN deliveries del ON del.innings_id = i.id
         AND del.striker_match_player_id = s.striker_mp
         AND del.bowler_match_player_id = s.bowler_mp
         AND del.voided = false
         AND del.is_dead_ball = false
     )
     SELECT
       -- batting view (the striker vs this bowler)
       COALESCE(SUM(d.bat_runs), 0)::int AS bat_runs,
       COUNT(*) FILTER (WHERE d.illegal_type IS DISTINCT FROM 'wide')::int AS balls_faced,
       COUNT(*) FILTER (WHERE d.bat_runs = 4)::int AS fours,
       COUNT(*) FILTER (WHERE d.bat_runs = 6)::int AS sixes,
       COUNT(*) FILTER (WHERE d.illegal_type IS DISTINCT FROM 'wide' AND d.bat_runs = 0)::int AS batting_dots,
       -- bowling view (the bowler vs this striker)
       COALESCE(SUM(d.total_runs - COALESCE(d.extra_runs, 0)), 0)::int AS runs_conceded,
       COUNT(*) FILTER (WHERE d.is_legal_delivery = true)::int AS legal_balls,
       -- equivalent overs under each match's own balls_per_over (mixed-format
       -- safe, mirrors bowlingStats.js#aggregateBowling)
       COALESCE(SUM(CASE WHEN d.is_legal_delivery = true THEN 1.0 / d.balls_per_over ELSE 0 END), 0)::float AS equivalent_overs,
       COUNT(*) FILTER (WHERE d.is_legal_delivery = true AND d.total_runs - COALESCE(d.extra_runs, 0) = 0)::int AS bowling_dots,
       -- dismissals of THIS striker credited to THIS bowler (run-outs excluded).
       -- Every row of d already has this striker as striker_match_player_id,
       -- so the wicket must have dismissed that same match_player.
       COUNT(w.id) FILTER (
         WHERE w.dismissed_match_player_id = d.striker_match_player_id
           AND w.dismissal_type IN ('bowled','caught','lbw','stumped','hit-wicket')
       )::int AS dismissals
     FROM d
     LEFT JOIN wickets w ON w.delivery_id = d.id`,
    [strikerPlayerId, bowlerPlayerId]
  )
  return rows[0]
}
