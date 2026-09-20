import { pool } from '../config/db.js'

// Phase 18 Feature 17 — in-app notifications only (no email/SMS — explicitly
// out of scope). One row per addressed notification.

// relatedMatchId (Phase 21/U7) mirrors relatedBookingId — a second,
// separate nullable FK rather than overloading the booking one, matching
// how the column was added to the schema in U1.
// Phase 15 — groundId/relatedOrderId are the same pattern again: groundId
// lets a notification with no booking/match relation (low stock, staff
// activation) still be ground-scoped; relatedOrderId mirrors relatedMatchId
// for canteen-order notification types.
export async function insertNotification(client, { userId, type, title, body = null, relatedBookingId = null, relatedMatchId = null, groundId = null, relatedOrderId = null }) {
  const { rows } = await client.query(
    `INSERT INTO ground_notifications (user_id, type, title, body, related_booking_id, related_match_id, ground_id, related_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [userId, type, title, body, relatedBookingId, relatedMatchId, groundId, relatedOrderId]
  )
  return rows[0]
}

// Phase 15 — Ground Owner's own portal view: notifications for THIS ground
// only, still scoped by user_id first (an Owner of multiple grounds must
// never see another owner's row even if groundId were ever wrong) — same
// "user_id is the primary scope" invariant every existing query on this
// table already follows.
// groundPublicId is joined in (never the raw internal ground_id) so the
// frontend can build a navigation link — matching the rest of this
// codebase's convention that only public_*_id values ever reach the wire.
export async function listForGround(userId, groundId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT n.*, g.public_ground_id AS ground_public_id, COUNT(*) OVER()::int AS total_count
     FROM ground_notifications n
     LEFT JOIN grounds g ON g.id = n.ground_id
     WHERE n.user_id = $1 AND n.ground_id = $2
     ORDER BY n.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, groundId, limit, offset]
  )
  const total = rows.length ? rows[0].total_count : 0
  return { rows, total }
}

export async function countUnreadForGround(userId, groundId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ground_notifications WHERE user_id = $1 AND ground_id = $2 AND is_read = false`, [userId, groundId])
  return rows[0].count
}

// Phase 15 — dedup guard for the on-demand operational-alert checks (low
// stock, menu not published): these are absence/threshold conditions with
// no natural single write-path event, so they're checked whenever the
// dashboard loads (see groundNotification.service.js#checkOperationalAlerts)
// rather than a new scheduler — this prevents that repeated check from
// creating a fresh duplicate notification row every single page load.
// `sinceUtc` is the caller-computed ground-local start-of-day (via
// groundLocalToUtc/groundTodayDateStr), matching every other day-boundary
// check in this codebase — never a bare DB-timezone date_trunc.
export async function existsSinceForGround(userId, groundId, type, sinceUtc) {
  const { rows } = await pool.query(
    `SELECT 1 FROM ground_notifications
     WHERE user_id = $1 AND ground_id = $2 AND type = $3 AND created_at >= $4
     LIMIT 1`,
    [userId, groundId, type, sinceUtc],
  )
  return rows.length > 0
}

// Deliberately NOT reusing the global markAllRead(userId) for the
// ground-scoped "mark all read" button — an Owner with multiple grounds
// viewing Ground A's notifications must never silently mark Ground B's
// notifications read too. Scoped by BOTH user_id and ground_id.
export async function markAllReadForGround(userId, groundId) {
  await pool.query(`UPDATE ground_notifications SET is_read = true WHERE user_id = $1 AND ground_id = $2 AND is_read = false`, [userId, groundId])
}

// Phase 15 — ground_public_id joined in for the same reason as
// listForGround above: lets the site-wide bell navigate to a Ground-Owner
// notification's ground without ever exposing the raw internal ground_id.
// NULL for every pre-Phase-15 notification type (ground_id was always NULL
// before this phase) — existing consumers of this response are unaffected,
// they simply gain one more (usually null) field.
export async function listForUser(userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT n.*, g.public_ground_id AS ground_public_id, COUNT(*) OVER()::int AS total_count
     FROM ground_notifications n
     LEFT JOIN grounds g ON g.id = n.ground_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )
  const total = rows.length ? rows[0].total_count : 0
  return { rows, total }
}

export async function countUnread(userId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ground_notifications WHERE user_id = $1 AND is_read = false`, [userId])
  return rows[0].count
}

export async function markRead(id, userId) {
  const { rows } = await pool.query(`UPDATE ground_notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId])
  return rows[0] || null
}

export async function markAllRead(userId) {
  await pool.query(`UPDATE ground_notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [userId])
}
