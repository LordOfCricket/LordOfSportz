import { pool } from '../config/db.js'

export async function createMatchPlayer({ matchId, teamId, playerId, isPlayingXi = true, isCaptain = false, isWicketkeeper = false, battingOrder = null }) {
  const { rows } = await pool.query(
    `INSERT INTO match_players (match_id, team_id, player_id, is_playing_xi, is_captain, is_wicketkeeper, batting_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [matchId, teamId, playerId, isPlayingXi, isCaptain, isWicketkeeper, battingOrder]
  )
  return rows[0]
}

export async function listMatchPlayers(matchId) {
  const { rows } = await pool.query(
    `SELECT mp.*, p.name, p.public_player_id
     FROM match_players mp
     JOIN players p ON p.id = mp.player_id
     WHERE mp.match_id = $1
     ORDER BY mp.id`,
    [matchId]
  )
  return rows
}

/** Map<matchPlayerId, { teamId, playerId }> — what validate.js needs to check every id it's given actually belongs to this match. */
export async function getMatchPlayersMap(matchId, client = pool) {
  const { rows } = await client.query('SELECT id, team_id, player_id FROM match_players WHERE match_id = $1', [matchId])
  return new Map(rows.map((r) => [r.id, { teamId: r.team_id, playerId: r.player_id }]))
}

export async function findMatchPlayerById(id) {
  const { rows } = await pool.query('SELECT * FROM match_players WHERE id = $1', [id])
  return rows[0] || null
}

/** Map<teamId, count> of players marked is_playing_xi for this match — what
 * Phase 5's "start match" validation needs to check both sides fielded a XI. */
export async function countPlayingXiByTeam(matchId) {
  const { rows } = await pool.query(
    'SELECT team_id, COUNT(*)::int AS count FROM match_players WHERE match_id = $1 AND is_playing_xi = true GROUP BY team_id',
    [matchId]
  )
  return new Map(rows.map((r) => [r.team_id, r.count]))
}

/** Scalar count for one team — what replay's roster-aware all-out threshold needs. */
export async function countPlayingXi(matchId, teamId, client = pool) {
  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS count FROM match_players WHERE match_id = $1 AND team_id = $2 AND is_playing_xi = true',
    [matchId, teamId]
  )
  return rows[0].count
}
