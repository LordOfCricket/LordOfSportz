import { pool } from '../config/db.js'

// Phase 6 — raw SQL, not Prisma, for the same reason as every other
// account-security table (permission.model.js, groundOwnerRequest.model.js):
// credential mutations must transact atomically with an account_audit_log
// insert and, on revoke, a session-revocation write — Prisma and the raw
// `pg` Pool are separate connections, so cross-table atomicity requires one
// access pattern.

export async function findActiveCredentialsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM webauthn_credentials WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at`,
    [userId],
  )
  return rows
}

export async function countActiveCredentialsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM webauthn_credentials WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  )
  return rows[0].count
}

// Looked up by credential_id alone during an authentication ceremony — the
// browser sends back which credential it used, never a userId the server
// would need to trust.
export async function findActiveCredentialByCredentialId(credentialId) {
  const { rows } = await pool.query(
    `SELECT * FROM webauthn_credentials WHERE credential_id = $1 AND revoked_at IS NULL`,
    [credentialId],
  )
  return rows[0] || null
}

export async function findCredentialById(id) {
  const { rows } = await pool.query(`SELECT * FROM webauthn_credentials WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createCredential(
  { userId, credentialId, publicKey, counter, deviceType, backedUp, transports, deviceName },
  client = pool,
) {
  const { rows } = await client.query(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_type, backed_up, transports, device_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, credentialId, publicKey, counter, deviceType, backedUp, transports, deviceName],
  )
  return rows[0]
}

// Called after every successful authentication ceremony — counter must
// only ever move forward (see webauthn.service.js's rollback check, done
// BEFORE this is called); last_used_at powers the Security Settings list.
export async function updateCounterAndLastUsed(id, counter) {
  await pool.query(`UPDATE webauthn_credentials SET counter = $2, last_used_at = NOW() WHERE id = $1`, [id, counter])
}

export async function revokeCredential(id, client = pool) {
  const { rows } = await client.query(
    `UPDATE webauthn_credentials SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
    [id],
  )
  return rows[0] || null
}
