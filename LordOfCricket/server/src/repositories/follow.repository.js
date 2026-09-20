import { pool } from '../config/db.js'

// Priority 1 — Social Foundation. One user_follows table backs both the
// "Follow" button and the "Following" quick-access list (see schema.sql).
// Every write is idempotent via ON CONFLICT DO NOTHING against the
// per-(user, target) UNIQUE constraints — a double-tap or a replayed
// request never creates a duplicate row and never errors.

export async function followPlayer(userId, playerId) {
  await pool.query(
    `INSERT INTO user_follows (user_id, player_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT user_follows_unique_player DO NOTHING`,
    [userId, playerId]
  )
}

export async function unfollowPlayer(userId, playerId) {
  await pool.query(`DELETE FROM user_follows WHERE user_id = $1 AND player_id = $2`, [userId, playerId])
}

export async function followTeam(userId, teamId) {
  await pool.query(
    `INSERT INTO user_follows (user_id, team_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT user_follows_unique_team DO NOTHING`,
    [userId, teamId]
  )
}

export async function unfollowTeam(userId, teamId) {
  await pool.query(`DELETE FROM user_follows WHERE user_id = $1 AND team_id = $2`, [userId, teamId])
}

export async function isFollowingPlayer(userId, playerId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_follows WHERE user_id = $1 AND player_id = $2 LIMIT 1`,
    [userId, playerId]
  )
  return rows.length > 0
}

export async function isFollowingTeam(userId, teamId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_follows WHERE user_id = $1 AND team_id = $2 LIMIT 1`,
    [userId, teamId]
  )
  return rows.length > 0
}

// Priority 5 — Favorite Grounds. Same idempotent ON CONFLICT DO NOTHING
// shape as followPlayer/followTeam above, against user_follows_unique_ground.
export async function followGround(userId, groundId) {
  await pool.query(
    `INSERT INTO user_follows (user_id, ground_id) VALUES ($1, $2)
     ON CONFLICT ON CONSTRAINT user_follows_unique_ground DO NOTHING`,
    [userId, groundId]
  )
}

export async function unfollowGround(userId, groundId) {
  await pool.query(`DELETE FROM user_follows WHERE user_id = $1 AND ground_id = $2`, [userId, groundId])
}

export async function isFollowingGround(userId, groundId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM user_follows WHERE user_id = $1 AND ground_id = $2 LIMIT 1`,
    [userId, groundId]
  )
  return rows.length > 0
}

// Public-safe followed-player refs, newest-follow-first. One bounded query
// (JOIN, never N+1) — same public column allowlist findPublicPlayerByPublicId
// uses. `limit` is clamped by the service.
export async function listFollowedPlayers(userId, { limit, offset }) {
  const { rows } = await pool.query(
    `SELECT f.created_at AS followed_at,
            p.public_player_id, p.name, p.role, p.photo_url,
            t.id AS team_id, t.name AS team_name, t.short_name AS team_short, t.logo_url AS team_logo,
            COUNT(*) OVER()::int AS total_count
     FROM user_follows f
     JOIN players p ON p.id = f.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE f.user_id = $1 AND f.player_id IS NOT NULL
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )
  return { rows, total: rows.length ? rows[0].total_count : 0 }
}

export async function listFollowedTeams(userId, { limit, offset }) {
  const { rows } = await pool.query(
    `SELECT f.created_at AS followed_at,
            t.id, t.name, t.short_name, t.logo_url,
            COUNT(*) OVER()::int AS total_count
     FROM user_follows f
     JOIN teams t ON t.id = f.team_id
     WHERE f.user_id = $1 AND f.team_id IS NOT NULL
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )
  return { rows, total: rows.length ? rows[0].total_count : 0 }
}

// Priority 5 — public-safe followed-ground refs, newest-follow-first. Only
// ACTIVE grounds (a suspended/draft ground is never surfaced anywhere
// public); primary_photo is the same correlated subquery ground discovery
// already uses (ground.model.js). One bounded query, never N+1.
export async function listFollowedGrounds(userId, { limit, offset }) {
  const { rows } = await pool.query(
    `SELECT f.created_at AS followed_at,
            g.public_ground_id, g.name, g.city, g.state,
            (SELECT gp.image_url FROM ground_photos gp
             WHERE gp.ground_id = g.id
             ORDER BY gp.sort_order, gp.created_at
             LIMIT 1) AS primary_photo,
            COUNT(*) OVER()::int AS total_count
     FROM user_follows f
     JOIN grounds g ON g.id = f.ground_id AND g.status = 'ACTIVE'
     WHERE f.user_id = $1 AND f.ground_id IS NOT NULL
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )
  return { rows, total: rows.length ? rows[0].total_count : 0 }
}
