import { pool } from '../config/db.js'

// Phase 9 — ground-scoped authorization storage. No public_id: like
// match_players/tournament_teams (schema.sql), this is an internal
// membership/join row, never addressed directly by its own API resource.

// Phase 4 — accepts an optional transaction client (default `pool`), same
// reasoning as ground.model.js#createGround: lets the ground-owner-request
// approval flow and ground-scoped staff creation write this row atomically
// alongside other statements. Existing callers are unaffected.
export async function createMembership({ groundId, userId, role, isActive = true }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO ground_users (ground_id, user_id, role, is_active)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [groundId, userId, role, isActive],
  )
  return rows[0]
}

// The authorization primitive: is there an ACTIVE grant for this exact
// (user, ground, role)? Deliberately narrow (single role, not "any of these
// roles") so callers compose it explicitly rather than hide role lists here.
export async function findActiveMembership(userId, groundId, role) {
  const { rows } = await pool.query(
    `SELECT * FROM ground_users WHERE user_id = $1 AND ground_id = $2 AND role = $3 AND is_active = true`,
    [userId, groundId, role],
  )
  return rows[0] || null
}

// Used by the authorization middleware (groundAccess.js) for "does this user
// hold ANY of these roles at this ground" checks — one query instead of the
// caller looping findActiveMembership() per candidate role.
export async function findActiveMembershipForAnyRole(userId, groundId, roles) {
  const { rows } = await pool.query(
    `SELECT * FROM ground_users
     WHERE user_id = $1 AND ground_id = $2 AND role = ANY($3::varchar[]) AND is_active = true
     LIMIT 1`,
    [userId, groundId, roles],
  )
  return rows[0] || null
}

export async function findMembershipsByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM ground_users WHERE user_id = $1 ORDER BY id', [userId])
  return rows
}

// Phase 5 — the IDOR guard every grant/revoke/disable staff-permission
// endpoint needs: requireGroundRole/requireGroundPermission only prove the
// caller owns :publicGroundId, they say nothing about whether a client-
// supplied :membershipId actually belongs to THAT ground. Callers must
// re-verify membership.ground_id === ground.id themselves (see
// groundStaff.service.js#resolveOwnedStaffMembership) — this function only
// resolves the row, it does not authorize anything on its own.
export async function findMembershipById(id) {
  const { rows } = await pool.query('SELECT * FROM ground_users WHERE id = $1', [id])
  return rows[0] || null
}

export async function findMembershipsByGroundId(groundId) {
  const { rows } = await pool.query('SELECT * FROM ground_users WHERE ground_id = $1 ORDER BY id', [groundId])
  return rows
}

// Phase 4 — groundStaff.service.js#listStaffForGround's read: same rows as
// findMembershipsByGroundId, scoped to a role list and joined out to the
// user's name/email/phone so the Ground Owner Staff Management page has
// something to display beyond a bare user id. Never selects password_hash
// or any other sensitive user column.
export async function findMembershipsByGroundIdAndRoles(groundId, roles) {
  const { rows } = await pool.query(
    `SELECT gu.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
     FROM ground_users gu
     JOIN users u ON u.id = gu.user_id
     WHERE gu.ground_id = $1 AND gu.role = ANY($2::varchar[]) AND gu.is_active = true
     ORDER BY gu.id`,
    [groundId, roles],
  )
  return rows
}

// U5 — the Ground Owner Dashboard's ground list: every ACTIVE membership
// row for this role, joined out to the real ground row. No uniqueness
// constraint restricts a user to one GROUND_OWNER row (confirmed by
// inspecting the schema before this phase) — one owner legitimately
// managing several grounds is already fully supported, not a new case to
// design around.
// U7 — the inverse of findGroundsOwnedByUser: every user actively holding
// GROUND_OWNER for a given ground (there is no uniqueness constraint on
// ground_id alone in ground_users, so more than one legitimate co-owner is
// already representable — this returns all of them, not just one).
// Phase 16 — dashboard staff summary. Deliberately a NEW, separate
// aggregate query rather than modifying findMembershipsByGroundIdAndRoles
// above: that function's existing `is_active = true` filter is relied on
// by the current Staff page (only ever shows active staff) — changing it
// would be an unrelated behavior change. This one counts BOTH active and
// inactive by role in a single GROUP BY, the only way to get an "inactive"
// count at all (no existing query returns disabled memberships).
export async function countStaffByRoleAndStatus(groundId) {
  const { rows } = await pool.query(
    `SELECT role, is_active, COUNT(*)::int AS count
     FROM ground_users
     WHERE ground_id = $1 AND role = ANY($2::varchar[])
     GROUP BY role, is_active`,
    [groundId, ['GROUND_ADMIN', 'CANTEEN_STAFF']],
  )
  return rows
}

export async function findActiveGroundOwnerUserIds(groundId) {
  const { rows } = await pool.query(
    `SELECT user_id FROM ground_users WHERE ground_id = $1 AND role = 'GROUND_OWNER' AND is_active = true`,
    [groundId],
  )
  return rows.map((r) => r.user_id)
}

export async function findGroundsOwnedByUser(userId, role = 'GROUND_OWNER') {
  const { rows } = await pool.query(
    `SELECT g.*
     FROM ground_users gu
     JOIN grounds g ON g.id = gu.ground_id
     WHERE gu.user_id = $1 AND gu.role = $2 AND gu.is_active = true
     ORDER BY g.name`,
    [userId, role],
  )
  return rows
}

// Phase 5 — accepts an optional transaction client (default `pool`), same
// reasoning as createMembership above: disableStaffMembership
// (groundStaff.service.js) writes this alongside an account_audit_log row in
// one transaction.
export async function setMembershipActive(id, isActive, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_users SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, isActive],
  )
  return rows[0] || null
}
