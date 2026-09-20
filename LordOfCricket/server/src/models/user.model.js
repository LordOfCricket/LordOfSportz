import { pool } from '../config/db.js'

// staff_role is resolved via a LEFT JOIN so it is always present (null for
// non-staff users, and null for a staff row with no staff_role_id assigned
// yet) without ever needing a second query.
//
// Phase 3 — `phone` and `status` are included here deliberately: every
// consumer of `req.user` across the app (67 call sites) reads from
// whatever this SELECT returns, so both auth paths (legacy JWT and the new
// session-cookie path) converging on this same function is what guarantees
// req.user has an identical shape regardless of which one authenticated
// the request.
// First-Login Player Profile Onboarding — `player_onboarding_completed` is
// resolved via the same LEFT JOIN pattern as staff_role above (NULL when no
// players row exists yet, e.g. an Umpire or a Player who hasn't touched
// their profile). getPostLoginPath (client) treats NULL the same as
// false — "not completed" — never inferred from which fields are filled,
// just this one column on the players row.
// SUPER_ADMIN Identity & Secure Provisioning feature — username/
// force_password_change join the public shape (never temp_password_hash/
// temp_password_expires_at: those are internal-only, read directly by
// otpAuth.service.js#loginWithPassword via findUserByEmail/ByPhone's own
// `u.*`, never exposed through this explicit allowlist or any API
// response).
const PUBLIC_COLUMNS =
  'u.id, u.name, u.email, u.phone, u.role, u.player_type, u.staff_id, u.username, u.status, u.force_password_change, u.created_at, u.updated_at, sr.name AS staff_role, p.profile_onboarding_completed AS player_onboarding_completed'
const FROM_USERS = 'users u LEFT JOIN staff_roles sr ON sr.id = u.staff_role_id LEFT JOIN players p ON p.user_id = u.id'

export async function createUser({ name, email, passwordHash, role = 'user' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, player_type, staff_id, created_at, NULL::text AS staff_role`,
    [name, email, passwordHash, role]
  )
  return rows[0]
}

// Phase 6 — accepts an optional transaction client (default `pool`) so
// staff.controller.js#createStaff can consume a step-up grant and create
// the account atomically (same reasoning as every other transaction-aware
// model function in this codebase).
// SUPER_ADMIN Identity & Secure Provisioning feature — username/
// forcePasswordChange are additive optional params; every existing caller
// that never passes them is unaffected (username stays NULL, forcePasswordChange
// defaults false, identical to today's behavior).
export async function createStaffUser({ name, email, passwordHash, staffId, staffRoleId, username = null, forcePasswordChange = false }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO users (name, email, password_hash, role, staff_id, staff_role_id, username, force_password_change)
     VALUES ($1, $2, $3, 'staff', $4, $5, $6, $7)
     RETURNING id`,
    [name, email, passwordHash, staffId || null, staffRoleId, username, forcePasswordChange]
  )
  return findUserById(rows[0].id, client)
}

// SUPER_ADMIN Identity & Secure Provisioning feature — "Admin Management":
// every staff account (super_admin/admin/canteen_staff), for the admin
// list page. Never selects password_hash/temp_password_hash.
export async function findAllStaffUsers(client = pool) {
  const { rows } = await client.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM ${FROM_USERS}
     WHERE u.role = 'staff'
     ORDER BY u.created_at DESC`,
  )
  return rows
}

// "Ground Owners" admin page — every distinct user holding an active
// GROUND_OWNER membership on at least one ground, with a per-owner ground
// count. No existing query does this platform-wide aggregation (every
// existing ground_users lookup is scoped to one user or one ground) —
// genuinely new, not a duplicate of anything in groundUser.model.js.
export async function findAllGroundOwners(client = pool) {
  const { rows } = await client.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
            COUNT(gu.ground_id)::int AS ground_count
     FROM users u
     JOIN ground_users gu ON gu.user_id = u.id AND gu.role = 'GROUND_OWNER' AND gu.is_active = true
     GROUP BY u.id
     ORDER BY u.name`,
  )
  return rows
}

// "Umpires" admin page — approved umpires (player_type already set to
// 'umpire' by the existing selectPlayerType/signup flow; APPROVED is
// determined by the latest umpire_requests row, same definition
// requireApprovedUmpire/isApprovedUmpireUser already use elsewhere).
export async function findAllUmpires(client = pool) {
  const { rows } = await client.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
            ur.status AS umpire_request_status
     FROM users u
     LEFT JOIN LATERAL (
       SELECT status FROM umpire_requests WHERE user_id = u.id ORDER BY requested_at DESC LIMIT 1
     ) ur ON true
     WHERE u.role = 'player' AND u.player_type = 'umpire'
     ORDER BY u.name`,
  )
  return rows
}

// Phase 4 — every function below takes an optional trailing transaction
// client (default `pool`), threaded through to any internal calls too
// (e.g. createUserFromOtp's own findUserById) — using the module-level pool
// for a read inside an uncommitted transaction on a different connection
// would not see the just-inserted row. Existing callers that never pass a
// client are completely unaffected.
export async function findUserById(id, client = pool) {
  const { rows } = await client.query(
    `SELECT ${PUBLIC_COLUMNS} FROM ${FROM_USERS} WHERE u.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function findUserByEmail(email, client = pool) {
  const { rows } = await client.query(
    `SELECT u.*, sr.name AS staff_role, p.profile_onboarding_completed AS player_onboarding_completed FROM ${FROM_USERS} WHERE u.email = $1`,
    [email]
  )
  return rows[0] || null
}

export async function findUserByPhone(phone, client = pool) {
  const { rows } = await client.query(
    `SELECT u.*, sr.name AS staff_role, p.profile_onboarding_completed AS player_onboarding_completed FROM ${FROM_USERS} WHERE u.phone = $1`,
    [phone]
  )
  return rows[0] || null
}

// Phase 3 — the one lookup the OTP login flow needs: "does a user already
// exist for this identifier" regardless of whether it's an email or a
// phone number. Returns the same full-row shape as findUserByEmail (incl.
// password_hash — callers that don't need it use toPublicUser, same as the
// existing login/signup controllers already do).
export async function findUserByIdentifier(identifier, identifierType, client = pool) {
  return identifierType === 'PHONE' ? findUserByPhone(identifier, client) : findUserByEmail(identifier, client)
}

// SUPER_ADMIN Identity & Secure Provisioning feature — the one place a
// caller needs password_hash by internal id rather than by identifier
// (self-service change-password, confirming the CURRENT password of an
// already-authenticated req.user, which only carries PUBLIC_COLUMNS).
export async function findPasswordHashById(id, client = pool) {
  const { rows } = await client.query('SELECT password_hash FROM users WHERE id = $1', [id])
  return rows[0]?.password_hash || null
}

// Phase 3 — OTP-only signup: no password, identified by whichever of
// email/phone the user actually entered. role defaults to 'user' (not yet
// chosen), exactly matching createUser()'s existing default for password
// signups — the post-auth role-selection flow (roleRedirect.model.js) is
// unchanged and applies identically to both.
export async function createUserFromOtp({ identifier, identifierType, name, role = 'user', playerType = null, staffRoleId = null }, client = pool) {
  const emailValue = identifierType === 'EMAIL' ? identifier : null
  const phoneValue = identifierType === 'PHONE' ? identifier : null
  const { rows } = await client.query(
    `INSERT INTO users (name, email, phone, password_hash, role, player_type, staff_role_id)
     VALUES ($1, $2, $3, NULL, $4, $5, $6)
     RETURNING id`,
    [name, emailValue, phoneValue, role, playerType, staffRoleId]
  )
  return findUserById(rows[0].id, client)
}

// New Signup Flow — the one case createUserFromOtp doesn't cover: an
// account created with BOTH email and phone already verified, plus a real
// password, in one shot (createUserFromOtp only ever takes ONE identifier,
// by design, for the find-or-create OTP-login path this table already
// serves — this is additive, not a replacement). role/playerType are
// already resolved by the caller (services/signup.service.js maps the
// form's Player/Umpire radio button to these exact existing values, same
// mapping requestRegistrationOtp's REGISTER_PLAYER/REGISTER_UMPIRE purposes
// already use) — never invented here.
export async function createUserFromSignup({ name, email, phone, passwordHash, role, playerType = null }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO users (name, email, phone, password_hash, role, player_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [name, email, phone, passwordHash, role, playerType]
  )
  return findUserById(rows[0].id, client)
}

export async function findAllUsers() {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM ${FROM_USERS} ORDER BY u.id`
  )
  return rows
}

export async function updateUser(id, fields, client = pool) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findUserById(id, client)

  // SUPER_ADMIN Identity & Secure Provisioning feature — updated_at is
  // always bumped here rather than requiring every caller to remember it;
  // `client` is a new optional param (default `pool`, matching every other
  // transaction-aware model function in this file) so password-change/
  // temp-credential flows can update atomically alongside their own audit
  // event write.
  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  await client.query(
    `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1`,
    [id, ...keys.map((key) => fields[key])]
  )
  return findUserById(id, client)
}

export async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id])
}
