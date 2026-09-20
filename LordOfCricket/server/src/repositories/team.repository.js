import { pool } from '../config/db.js'

const MAX_SEARCH_TERM_LENGTH = 100

/**
 * Public team listing (Part 6/9/47). squad/match/win/tie counts are
 * correlated subqueries the planner executes inline per row — not a query
 * loop from application code. `search` is always parameterized (Part 53),
 * trimmed, and length-clamped defensively.
 *
 * Bug fix (found via publicTeam.integration.test.js's pagination-stability
 * test once the team table shrank to fewer rows than a page size — never
 * caused by that data change, a latent flaw in this query since it was
 * written): `total` used to ride along as a `COUNT(*) OVER()` column on
 * each returned row, so a page whose OFFSET lands past the last matching
 * row returns zero rows and — with nothing to read `total_count` off of —
 * silently reported `total: 0` even when matches exist. Fixed with a
 * separate COUNT query, decoupled from LIMIT/OFFSET, so it's always
 * accurate regardless of which page is requested — the same two-query
 * shape `canteenOrder.model.js#listOrdersPaginated` already uses for
 * exactly this reason, not a new pagination pattern.
 */
export async function listPublicTeams({ search = null, limit = 20, offset = 0 } = {}) {
  const term = search ? search.trim().slice(0, MAX_SEARCH_TERM_LENGTH) : null
  const whereClause = `WHERE ($1::text IS NULL OR $1 = '' OR t.name ILIKE '%' || $1 || '%')`

  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM teams t ${whereClause}`, [term])
  const { rows } = await pool.query(
    `SELECT
       t.id, t.name, t.short_name, t.logo_url,
       (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS squad_count,
       (SELECT COUNT(*) FROM matches m WHERE m.status = 'finalized' AND (m.team_a_id = t.id OR m.team_b_id = t.id)) AS match_count,
       (SELECT COUNT(*) FROM matches m WHERE m.status = 'finalized' AND m.winner_team_id = t.id) AS win_count,
       (SELECT COUNT(*) FROM matches m WHERE m.status = 'finalized' AND m.result_type = 'TIE' AND (m.team_a_id = t.id OR m.team_b_id = t.id)) AS tie_count
     FROM teams t
     ${whereClause}
     ORDER BY t.name ASC, t.id ASC
     LIMIT $2 OFFSET $3`,
    [term, limit, offset]
  )
  return { rows, total: countRows[0].count }
}

/**
 * Every FINALIZED match this team played, either side (Part 18/93 — same
 * finalized-only eligibility rule Phase 7's official player career stats
 * already use). Used for the Official Record tiles and Recent Form.
 */
export async function listFinalizedMatchesForTeam(teamId) {
  const { rows } = await pool.query(
    `SELECT m.id AS match_id, m.match_date, m.team_a_id, m.team_b_id, m.winner_team_id, m.result_type, m.result_margin, m.result
     FROM matches m
     WHERE m.status = 'finalized' AND (m.team_a_id = $1 OR m.team_b_id = $1)
     ORDER BY m.match_date DESC, m.id DESC`,
    [teamId]
  )
  return rows
}

/**
 * Every FINALIZED-match Playing XI appearance this team fielded, scoped by
 * match_players.team_id — the team the player represented IN THAT MATCH, NOT
 * players.team_id (their current team). This is the one query that makes
 * "top performers = all-time team representation, survives transfers"
 * (Part 37/40/41) structurally correct rather than something the service
 * layer has to remember to get right.
 */
export async function listFinalizedMatchParticipationForTeam(teamId) {
  const { rows } = await pool.query(
    `SELECT mp.id AS match_player_id, mp.match_id, mp.player_id, p.name, p.public_player_id
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     JOIN players p ON p.id = mp.player_id
     WHERE mp.team_id = $1 AND mp.is_playing_xi = true AND m.status = 'finalized'
     ORDER BY m.match_date ASC, m.id ASC`,
    [teamId]
  )
  return rows
}
