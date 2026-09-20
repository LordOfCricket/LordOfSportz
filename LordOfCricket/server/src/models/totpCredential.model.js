import { pool } from '../config/db.js'

// Phase 6 — raw SQL, not Prisma (same cross-table-transaction reasoning as
// webauthnCredential.model.js). One row per user (UNIQUE user_id) —
// re-enrolling replaces the previous row entirely via upsert-by-delete,
// never accumulates orphaned secrets.

export async function findByUserId(userId) {
  const { rows } = await pool.query(`SELECT * FROM totp_credentials WHERE user_id = $1`, [userId])
  return rows[0] || null
}

// Only a verified (confirmed with a real code), non-disabled row counts as
// an active factor — see schema.sql's comment on why verified_at is
// separate from disabled_at.
export async function findActiveByUserId(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM totp_credentials WHERE user_id = $1 AND verified_at IS NOT NULL AND disabled_at IS NULL`,
    [userId],
  )
  return rows[0] || null
}

// Enrollment (re-)start: delete any prior row (verified or not) for this
// user, then insert a fresh unverified one. A single statement pair, not a
// transaction, is sufficient — this is not yet an "active factor" until
// markVerified runs, so there's no security-relevant intermediate state to
// protect against a crash between the two statements.
export async function upsertPendingSecret(userId, encryptedSecret) {
  await pool.query(`DELETE FROM totp_credentials WHERE user_id = $1`, [userId])
  const { rows } = await pool.query(
    `INSERT INTO totp_credentials (user_id, encrypted_secret) VALUES ($1, $2) RETURNING *`,
    [userId, encryptedSecret],
  )
  return rows[0]
}

export async function markVerified(userId) {
  const { rows } = await pool.query(
    `UPDATE totp_credentials SET verified_at = NOW() WHERE user_id = $1 RETURNING *`,
    [userId],
  )
  return rows[0] || null
}

// Guards replaying the same 30-second code twice within its own validity
// window — otplib's window tolerance alone does not prevent this.
export async function updateLastVerifiedStep(userId, step) {
  await pool.query(`UPDATE totp_credentials SET last_verified_step = $2, last_used_at = NOW() WHERE user_id = $1`, [userId, step])
}

export async function disable(userId, client = pool) {
  const { rows } = await client.query(
    `UPDATE totp_credentials SET disabled_at = NOW() WHERE user_id = $1 AND disabled_at IS NULL RETURNING *`,
    [userId],
  )
  return rows[0] || null
}
