import { pool } from '../config/db.js'

// Phase 5 — raw SQL, not Prisma, for the same reason as
// groundOwnerRequest.model.js/accountAuditLog.model.js: granting/revoking a
// permission must transact atomically with an account_audit_log insert, and
// Prisma + the raw `pg` Pool are separate connections — one access pattern
// per transaction, not two.

export async function findPermissionByKey(key) {
  const { rows } = await pool.query('SELECT * FROM permissions WHERE key = $1 AND is_active = true', [key])
  return rows[0] || null
}

export async function listAllPermissions() {
  const { rows } = await pool.query('SELECT * FROM permissions WHERE is_active = true ORDER BY id')
  return rows
}

// The hot authorization-check path — requireGroundPermission calls this on
// every permission-gated request. Backed by idx_staff_permissions_active_unique
// (ground_user_id, permission_id) WHERE revoked_at IS NULL — a single indexed
// row lookup, never a scan.
export async function hasActivePermission(groundUserId, permissionKey) {
  const { rows } = await pool.query(
    `SELECT 1 FROM staff_permissions sp
     JOIN permissions p ON p.id = sp.permission_id
     WHERE sp.ground_user_id = $1 AND p.key = $2 AND p.is_active = true AND sp.revoked_at IS NULL
     LIMIT 1`,
    [groundUserId, permissionKey],
  )
  return rows.length > 0
}

// Batched — the Ground Owner staff list renders every row's grants in one
// request; this avoids querying per staff row (N+1).
export async function findActivePermissionsForGroundUserIds(groundUserIds) {
  if (groundUserIds.length === 0) return []
  const { rows } = await pool.query(
    `SELECT sp.ground_user_id, p.key
     FROM staff_permissions sp
     JOIN permissions p ON p.id = sp.permission_id
     WHERE sp.ground_user_id = ANY($1::int[]) AND p.is_active = true AND sp.revoked_at IS NULL`,
    [groundUserIds],
  )
  return rows
}

export async function findActiveGrant(groundUserId, permissionId) {
  const { rows } = await pool.query(
    `SELECT * FROM staff_permissions WHERE ground_user_id = $1 AND permission_id = $2 AND revoked_at IS NULL`,
    [groundUserId, permissionId],
  )
  return rows[0] || null
}

export async function grantPermission({ groundUserId, permissionId, grantedBy }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO staff_permissions (ground_user_id, permission_id, granted_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [groundUserId, permissionId, grantedBy],
  )
  return rows[0]
}

export async function revokePermission({ groundUserId, permissionId, revokedBy }, client = pool) {
  const { rows } = await client.query(
    `UPDATE staff_permissions
     SET revoked_at = NOW(), revoked_by = $3
     WHERE ground_user_id = $1 AND permission_id = $2 AND revoked_at IS NULL
     RETURNING *`,
    [groundUserId, permissionId, revokedBy],
  )
  return rows[0] || null
}
