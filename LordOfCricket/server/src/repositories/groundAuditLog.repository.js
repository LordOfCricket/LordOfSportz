import { pool } from '../config/db.js'

// Phase 18 Feature 16 — append-only audit trail, mirrors score_corrections'
// proven shape (full before/after JSONB snapshots, never a diff).

export async function insertEntry(client, { entityType, entityId, action, actorUserId = null, previousValue = null, newValue = null }) {
  const { rows } = await client.query(
    `INSERT INTO ground_audit_log (entity_type, entity_id, action, actor_user_id, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [entityType, entityId, action, actorUserId, previousValue, newValue]
  )
  return rows[0]
}

export async function listForEntity(entityType, entityId, client = pool) {
  const { rows } = await client.query(
    `SELECT l.*, u.name AS actor_name
     FROM ground_audit_log l
     LEFT JOIN users u ON u.id = l.actor_user_id
     WHERE l.entity_type = $1 AND l.entity_id = $2
     ORDER BY l.created_at DESC`,
    [entityType, entityId]
  )
  return rows
}

export async function listRecent({ limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT l.*, u.name AS actor_name, COUNT(*) OVER()::int AS total_count
     FROM ground_audit_log l
     LEFT JOIN users u ON u.id = l.actor_user_id
     ORDER BY l.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  const total = rows.length ? rows[0].total_count : 0
  return { rows, total }
}
