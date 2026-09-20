import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'

const MAX_PUBLIC_ID_ATTEMPTS = 5

export async function createPlayer({ name, teamId, role, battingStyle = null, bowlingStyle = null, userId = null }, client = pool) {
  for (let attempt = 0; attempt < MAX_PUBLIC_ID_ATTEMPTS; attempt++) {
    const publicPlayerId = generatePublicId('CVP')
    try {
      const { rows } = await client.query(
        `INSERT INTO players (name, team_id, role, batting_style, bowling_style, user_id, public_player_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, teamId, role, battingStyle, bowlingStyle, userId, publicPlayerId]
      )
      return rows[0]
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'players_public_player_id_key') continue
      throw err
    }
  }
  throw new Error('Failed to generate a unique public player ID.')
}

export async function findPlayerById(id) {
  const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [id])
  return rows[0] || null
}

export async function findPlayerByPublicId(publicPlayerId) {
  const { rows } = await pool.query('SELECT * FROM players WHERE public_player_id = $1', [publicPlayerId])
  return rows[0] || null
}

export async function findPlayerByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM players WHERE user_id = $1', [userId])
  return rows[0] || null
}

export async function findPlayersByTeam(teamId) {
  const { rows } = await pool.query(
    'SELECT * FROM players WHERE team_id = $1 ORDER BY id',
    [teamId]
  )
  return rows
}

// Phase 24 — bulk lookup for validating a booking's participant list in one
// round trip rather than N queries. Returns whichever ids actually resolved
// to a real row (never fabricates the missing ones) — see domain/booking/
// participants.js#assertPlayersExist for how a caller turns a short result
// into a specific PLAYER_NOT_FOUND error.
export async function findPlayersByIds(ids) {
  if (!ids.length) return []
  const { rows } = await pool.query('SELECT * FROM players WHERE id = ANY($1::int[])', [ids])
  return rows
}

export async function findAllPlayers() {
  const { rows } = await pool.query('SELECT * FROM players ORDER BY id')
  return rows
}

export async function updatePlayer(id, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findPlayerById(id)

  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE players SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

export async function deletePlayer(id) {
  await pool.query('DELETE FROM players WHERE id = $1', [id])
}

// SUPER_ADMIN Identity & Secure Provisioning feature — "Players" admin
// list (§5's sidebar). Joins to users for real account info (email/phone/
// status) rather than trusting players.name alone, which can drift from
// the account holder's registered name (see profile-edit's own separate
// "Display Name" field). Excludes umpires (player_type='umpire') — those
// have their own dedicated admin list (findAllUmpires, user.model.js).
export async function findAllPlayersForAdmin() {
  const { rows } = await pool.query(
    `SELECT p.id, p.public_player_id, p.jersey_number, p.city, p.role,
            u.id AS user_id, u.name, u.email, u.phone, u.status, u.created_at
     FROM players p
     JOIN users u ON u.id = p.user_id
     WHERE u.player_type = 'team_player'
     ORDER BY u.name`,
  )
  return rows
}
