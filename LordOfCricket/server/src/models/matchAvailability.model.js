import { pool } from '../config/db.js'

export async function upsertAvailability(matchId, playerId, status) {
  const { rows } = await pool.query(
    `INSERT INTO match_availability (match_id, player_id, status, responded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (match_id, player_id)
     DO UPDATE SET status = EXCLUDED.status, responded_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [matchId, playerId, status]
  )
  return rows[0]
}

export async function findAvailability(matchId, playerId) {
  const { rows } = await pool.query('SELECT * FROM match_availability WHERE match_id = $1 AND player_id = $2', [matchId, playerId])
  return rows[0] || null
}

/** Every player eligible to respond (on either of the match's two teams),
 * defaulting to PENDING for anyone who hasn't responded yet — never omits an
 * eligible player just because they have no row. */
export async function listAvailabilityForMatch(matchId, teamAId, teamBId) {
  const { rows } = await pool.query(
    `SELECT p.id AS player_id, p.name, p.team_id, COALESCE(ma.status, 'PENDING') AS status, ma.responded_at
     FROM players p
     LEFT JOIN match_availability ma ON ma.player_id = p.id AND ma.match_id = $1
     WHERE p.team_id IN ($2, $3)
     ORDER BY p.team_id, p.name`,
    [matchId, teamAId, teamBId]
  )
  return rows
}
