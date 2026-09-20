import { pool } from '../config/db.js'

// Phase 4 — raw SQL, not Prisma; see groundOwnerRequest.model.js's header
// comment for why (this table is written inside the same cross-table
// transactions as ground_owner_requests/users/grounds/ground_users).

export async function insertEvent({ eventType, actorUserId = null, targetUserId = null, targetRequestId = null, metadata = null }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO account_audit_log (event_type, actor_user_id, target_user_id, target_request_id, metadata)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [eventType, actorUserId, targetUserId, targetRequestId, metadata],
  )
  return rows[0]
}

// SUPER_ADMIN Identity & Secure Provisioning feature — "Audit Logs" admin
// page (§15). Paginated, optionally filtered by event_type; joins out
// actor/target NAMES purely for display (never re-selects password_hash
// or anything sensitive — metadata itself already never carries plaintext
// secrets, enforced at every recordEvent call site, not here).
export async function findAuditLogPage({ eventType, limit = 50, offset = 0 } = {}) {
  const params = []
  let where = ''
  if (eventType) {
    params.push(eventType)
    where = `WHERE a.event_type = $${params.length}`
  }
  params.push(limit, offset)

  const { rows } = await pool.query(
    `SELECT a.id, a.event_type, a.metadata, a.created_at,
            actor.name AS actor_name, actor.id AS actor_user_id,
            target.name AS target_name, target.id AS target_user_id
     FROM account_audit_log a
     LEFT JOIN users actor ON actor.id = a.actor_user_id
     LEFT JOIN users target ON target.id = a.target_user_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )

  const countParams = eventType ? [eventType] : []
  const countWhere = eventType ? 'WHERE event_type = $1' : ''
  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM account_audit_log ${countWhere}`, countParams)

  return { rows, total: countRows[0].count }
}

// "Admin Management" list (§17) — "Last login" is derived from the existing
// ADMIN_LOGIN audit event (recorded on every staff login, see
// otpAuth.service.js) rather than a new users.last_login_at column, so
// nothing extra needs to be written on the login hot path.
export async function findLatestAdminLoginTimestamps() {
  const { rows } = await pool.query(
    `SELECT target_user_id, MAX(created_at) AS last_login_at
     FROM account_audit_log
     WHERE event_type = 'ADMIN_LOGIN' AND target_user_id IS NOT NULL
     GROUP BY target_user_id`,
  )
  return new Map(rows.map((r) => [r.target_user_id, r.last_login_at]))
}
