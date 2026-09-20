import { pool } from '../config/db.js'

// Phase 6 — recovery codes, hashed (SHA-256, same reasoning as
// otp_codes.otp_hash — single-use and revoked immediately on use, not a
// long-lived secret needing bcrypt's cost factor).

export async function countActiveForUser(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  )
  return rows[0].count
}

// Regeneration invalidates every previous code (used or not) — a
// regenerate always means "the old set is no longer trusted," matching the
// brief's "revocable/regeneratable" requirement.
export async function replaceCodesForUser(userId, codeHashes, client = pool) {
  await client.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId])
  for (const codeHash of codeHashes) {
    await client.query(`INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [userId, codeHash])
  }
}

// Single-use: the WHERE-guarded UPDATE is the entire concurrency guard — a
// code can never be consumed twice, even by two simultaneous requests.
export async function consumeMatchingCode(userId, codeHash) {
  const { rows } = await pool.query(
    `UPDATE mfa_recovery_codes SET used_at = NOW()
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
     RETURNING *`,
    [userId, codeHash],
  )
  return rows[0] || null
}
