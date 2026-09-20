import { pool } from '../config/db.js'

// Every match_player row this player was an official Playing XI participant
// in, restricted to FINALIZED matches only (Phase 7's one hard rule — a
// completed-but-not-finalized or live match must never contribute to career
// totals). Carries the match/opponent context match history needs so callers
// never have to re-query per match.
export async function listFinalizedMatchParticipation(playerId, client = pool) {
  const { rows } = await client.query(
    `SELECT mp.id AS match_player_id, mp.match_id, mp.team_id, mp.is_wicketkeeper,
            m.match_date, m.venue, m.team_a_id, m.team_b_id,
            m.winner_team_id, m.result_type, m.result_margin, m.result,
            ta.name AS team_a_name, tb.name AS team_b_name,
            ta.short_name AS team_a_short, tb.short_name AS team_b_short,
            ta.logo_url AS team_a_logo, tb.logo_url AS team_b_logo
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE mp.player_id = $1 AND mp.is_playing_xi = true AND m.status = 'finalized'
     ORDER BY m.match_date ASC, m.id ASC`,
    [playerId]
  )
  return rows
}

/** Both innings of every match in `matchIds`, so the service can replay each
 * one exactly once instead of one query per innings. */
export async function listInningsForMatches(matchIds, client = pool) {
  if (matchIds.length === 0) return []
  const { rows } = await client.query('SELECT * FROM innings WHERE match_id = ANY($1) ORDER BY match_id, innings_number', [matchIds])
  return rows
}

// Fielding is the one stat that doesn't need a replay — it's a plain fact
// already attached to the wicket row. Scoped to finalized matches and
// non-voided deliveries (a voided delivery contributed nothing to the match,
// so any wicket recorded against it is dead data, same rule replay.js already
// applies to batting/bowling).
export async function listFieldingWicketsForPlayers(matchPlayerIds, client = pool) {
  if (matchPlayerIds.length === 0) return []
  const { rows } = await client.query(
    `SELECT w.dismissal_type, w.fielder_match_player_id, w.secondary_fielder_match_player_id
     FROM wickets w
     JOIN deliveries d ON d.id = w.delivery_id
     JOIN innings i ON i.id = d.innings_id
     JOIN matches m ON m.id = i.match_id
     WHERE m.status = 'finalized' AND d.voided = false
       AND (w.fielder_match_player_id = ANY($1) OR w.secondary_fielder_match_player_id = ANY($1))`,
    [matchPlayerIds]
  )
  return rows
}

/**
 * Distinct players.id with at least one finalized-match Playing XI
 * appearance — the candidate pool for a leaderboard. `role`/`teamId` filter
 * at the SQL layer (role = profile role, teamId = player's CURRENT team —
 * Part 31's documented semantics) BEFORE any career gets computed, so a
 * filtered leaderboard never wastes a replay on a player who'd be excluded
 * anyway (Part 30's N+1 guidance).
 */
export async function listCandidatePlayersWithFinalizedMatches({ role = null, teamId = null } = {}, client = pool) {
  const { rows } = await client.query(
    `SELECT DISTINCT p.id AS player_id
     FROM match_players mp
     JOIN matches m ON m.id = mp.match_id
     JOIN players p ON p.id = mp.player_id
     WHERE mp.is_playing_xi = true AND m.status = 'finalized'
       AND ($1::varchar IS NULL OR p.role = $1)
       AND ($2::integer IS NULL OR p.team_id = $2)`,
    [role, teamId]
  )
  return rows.map((r) => r.player_id)
}

/**
 * Public player search/discovery — name or public_player_id, case-insensitive,
 * optionally filtered by role and CURRENT team. Returns ONLY public-safe
 * columns (never email/phone/user_id) — this is the query the public
 * discovery page and leaderboard player cards read from directly.
 */
export async function searchPlayers({ q = null, role = null, teamId = null, limit = 20, offset = 0 } = {}, client = pool) {
  const term = q ? q.trim() : null
  const { rows } = await client.query(
    `SELECT p.id, p.name, p.public_player_id, p.role, p.photo_url, p.batting_style, p.bowling_style,
            p.team_id, t.name AS team_name, t.short_name AS team_short, t.logo_url AS team_logo,
            COUNT(*) OVER() AS total_count
     FROM players p
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE ($1::varchar IS NULL OR p.name ILIKE '%' || $1 || '%' OR p.public_player_id ILIKE '%' || $1 || '%')
       AND ($2::varchar IS NULL OR p.role = $2)
       AND ($3::integer IS NULL OR p.team_id = $3)
     ORDER BY p.name ASC, p.id ASC
     LIMIT $4 OFFSET $5`,
    [term, role, teamId, limit, offset]
  )
  const total = rows.length ? Number(rows[0].total_count) : 0
  return { rows, total }
}

// Priority 3 — LOC Cricket Records. Five cheap aggregate reads over the
// authoritative innings/matches cache columns (innings.runs / wickets /
// legal_balls and matches.result_type / result_margin / winner_team_id — the
// same columns tournamentAnalytics.service.js already trusts) across ALL
// finalized matches. No per-innings replay, no N+1: every figure is a plain
// column value or a SUM, team names joined in SQL so the service never does a
// second lookup. `limit` is small (see CRICKET_RECORD_LIMIT).
export async function getCricketRecordRows(limit, client = pool) {
  const teamTotalSelect = `
    SELECT i.runs, i.wickets, i.legal_balls, i.batting_team_id, i.bowling_team_id,
           m.id AS match_id, m.match_date,
           bat.name AS batting_team_name, bat.short_name AS batting_team_short,
           bowl.name AS bowling_team_name, bowl.short_name AS bowling_team_short
    FROM innings i
    JOIN matches m ON m.id = i.match_id
    JOIN teams bat ON bat.id = i.batting_team_id
    JOIN teams bowl ON bowl.id = i.bowling_team_id
    WHERE m.status = 'finalized'`

  const victorySelect = `
    SELECT m.id AS match_id, m.match_date, m.result_margin, m.result_type, m.result, m.winner_team_id,
           m.team_a_id, m.team_b_id,
           ta.name AS team_a_name, ta.short_name AS team_a_short,
           tb.name AS team_b_name, tb.short_name AS team_b_short
    FROM matches m
    JOIN teams ta ON ta.id = m.team_a_id
    JOIN teams tb ON tb.id = m.team_b_id
    WHERE m.status = 'finalized' AND m.result_margin IS NOT NULL AND m.winner_team_id IS NOT NULL
      AND m.result_type = $2`

  const [highestTeamTotals, highestMatchAggregates, biggestWinsByRuns, biggestWinsByWickets, highestSuccessfulChases] =
    await Promise.all([
      client.query(`${teamTotalSelect} ORDER BY i.runs DESC, m.match_date DESC, m.id DESC LIMIT $1`, [limit]),
      client.query(
        `SELECT m.id AS match_id, m.match_date, SUM(i.runs)::int AS total_runs,
                m.team_a_id, m.team_b_id,
                ta.name AS team_a_name, ta.short_name AS team_a_short,
                tb.name AS team_b_name, tb.short_name AS team_b_short
         FROM matches m
         JOIN innings i ON i.match_id = m.id
         JOIN teams ta ON ta.id = m.team_a_id
         JOIN teams tb ON tb.id = m.team_b_id
         WHERE m.status = 'finalized'
         GROUP BY m.id, m.match_date, m.team_a_id, m.team_b_id, ta.name, ta.short_name, tb.name, tb.short_name
         ORDER BY total_runs DESC, m.match_date DESC, m.id DESC
         LIMIT $1`,
        [limit]
      ),
      client.query(`${victorySelect} ORDER BY m.result_margin DESC, m.match_date DESC, m.id DESC LIMIT $1`, [limit, 'RUNS']),
      client.query(`${victorySelect} ORDER BY m.result_margin DESC, m.match_date DESC, m.id DESC LIMIT $1`, [limit, 'WICKETS']),
      client.query(
        `${teamTotalSelect} AND i.innings_number = 2 AND m.winner_team_id = i.batting_team_id
         ORDER BY i.runs DESC, m.match_date DESC, m.id DESC LIMIT $1`,
        [limit]
      ),
    ])

  return {
    highestTeamTotals: highestTeamTotals.rows,
    highestMatchAggregates: highestMatchAggregates.rows,
    biggestWinsByRuns: biggestWinsByRuns.rows,
    biggestWinsByWickets: biggestWinsByWickets.rows,
    highestSuccessfulChases: highestSuccessfulChases.rows,
  }
}

/** Public-safe player identity + current team, for a public profile header
 * (never email/phone/user_id/canteen data — see statistics.service.js). */
export async function findPublicPlayerByPublicId(publicPlayerId, client = pool) {
  const { rows } = await client.query(
    `SELECT p.id, p.name, p.public_player_id, p.role, p.batting_style, p.bowling_style,
            p.jersey_number, p.photo_url, p.city, p.bio,
            p.team_id, t.name AS team_name, t.short_name AS team_short, t.logo_url AS team_logo
     FROM players p
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE p.public_player_id = $1`,
    [publicPlayerId]
  )
  return rows[0] || null
}
