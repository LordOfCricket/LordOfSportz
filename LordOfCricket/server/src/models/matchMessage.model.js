import { pool } from '../config/db.js'

// Umpire Communication & Commercial 2.0 — one row per sent message, serving
// both "announcements" and "chat" (the same underlying record, see
// matchMessage.service.js). sender_role is stored on the row, not
// re-derived on read, so history stays correct across a replacement umpire.

export async function insertMessage({ matchId, senderUserId, senderRole, body }) {
  const { rows } = await pool.query(
    `INSERT INTO match_messages (match_id, sender_user_id, sender_role, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [matchId, senderUserId, senderRole, body],
  )
  return rows[0]
}

export async function findMessagesForMatch(matchId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT m.id, m.match_id, m.sender_user_id, m.sender_role, m.body, m.created_at, u.name AS sender_name
     FROM match_messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.match_id = $1
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT $2`,
    [matchId, limit],
  )
  return rows
}
