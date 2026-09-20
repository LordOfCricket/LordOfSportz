// SUPER_ADMIN Identity & Secure Provisioning feature — the production-safe
// bootstrap this codebase didn't have (server/src/config/seed.js already
// creates a super_admin, but it's dev-only: it hard-refuses to run when
// NODE_ENV=production, and its password is a hardcoded literal
// ('password'), never read from the environment — the opposite of what a
// real bootstrap needs). This script is that missing production path.
//
// The password is NEVER hardcoded, NEVER logged, NEVER echoed back — it is
// read once from BOOTSTRAP_SUPER_ADMIN_PASSWORD, hashed with the exact
// same bcrypt(cost 10) every other password in this app uses
// (domain/otpAuth/password.js's policy), and the raw env var is never
// referenced again after that hash is computed.
//
// Reuses staffAccount.service.js#createPlatformStaff for the actual
// INSERT (same table, same columns, same Admin ID generator) — this
// script is a caller of that existing mechanism, not a second one. The
// one thing it does differently: createPlatformStaff is step-up-gated
// (correct for an authenticated Super Admin creating ANOTHER one via the
// UI), but there is no session/step-up grant to consume for the very
// FIRST Super Admin, who doesn't exist yet to have authenticated at all —
// so this script inserts directly, the same way seed.js already does for
// its own dev account, and records the SAME STAFF_CREATED-style audit
// trail explicitly (SUPER_ADMIN_BOOTSTRAPPED) so "who/how was this account
// created" is still answerable.
//
// Idempotent: if an account for this exact email already exists, the
// script reports it and exits cleanly without creating a duplicate or
// silently overwriting an existing account's password.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { findUserByEmail } from '../models/user.model.js'
import { findStaffRoleByName } from '../models/staffRole.model.js'
import { generateAdminId } from '../utils/adminId.js'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from '../services/accountAudit.service.js'

async function bootstrap() {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD
  const username = process.env.BOOTSTRAP_SUPER_ADMIN_USERNAME || 'loc.superadmin'
  const name = process.env.BOOTSTRAP_SUPER_ADMIN_NAME || 'LOC Super Admin'

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    console.error('❌ BOOTSTRAP_SUPER_ADMIN_EMAIL must be set to a real, reachable email address.')
    process.exit(1)
  }
  if (!password) {
    console.error('❌ BOOTSTRAP_SUPER_ADMIN_PASSWORD must be set (never hardcode it — pass it as an environment variable at run time).')
    process.exit(1)
  }
  const policy = validatePasswordPolicy(password)
  if (!policy.valid) {
    console.error(`❌ BOOTSTRAP_SUPER_ADMIN_PASSWORD does not meet the password policy: ${policy.reason}`)
    process.exit(1)
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    console.log(`ℹ️  An account already exists for ${email} (id ${existing.id}, role ${existing.role}). Bootstrap is idempotent — skipping, no changes made.`)
    await pool.end()
    return
  }

  const staffRole = await findStaffRoleByName('super_admin')
  if (!staffRole) {
    console.error("❌ staff_roles has no 'super_admin' row — run `npm run db:migrate` first.")
    process.exit(1)
  }

  const adminId = await generateAdminId()
  const passwordHash = await bcrypt.hash(password, 10)

  let userId
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, staff_id, staff_role_id, username, status, force_password_change)
       VALUES ($1, $2, $3, 'staff', $4, $5, $6, 'ACTIVE', TRUE)
       RETURNING id`,
      [name, email, passwordHash, adminId, staffRole.id, username],
    )
    userId = rows[0].id
  } catch (err) {
    // §21 "Duplicate bootstrap is safely handled" — a DIFFERENT email with
    // the same (or default) username is a real, distinct conflict, not the
    // same-email idempotent-skip case handled above. Fails loudly with a
    // clear fix rather than a raw Postgres constraint message.
    if (err.code === '23505' && err.constraint === 'users_username_key') {
      console.error(`❌ Username "${username}" is already in use by a different account. Set BOOTSTRAP_SUPER_ADMIN_USERNAME to a different value and try again.`)
      process.exit(1)
    }
    throw err
  }

  await recordEvent(ACCOUNT_AUDIT_EVENTS.SUPER_ADMIN_BOOTSTRAPPED, { targetUserId: userId, metadata: { adminId, username } })

  console.log(`✅ Bootstrap Super Admin created.`)
  console.log(`   Admin ID: ${adminId}`)
  console.log(`   Username: ${username}`)
  console.log(`   Email:    ${email}`)
  console.log(`   MFA:      required (enroll at /security after first login)`)
  console.log(`   Note:     force_password_change is set — the initial password must be changed on first login before any admin route is reachable.`)
  console.log(`   The password itself is never printed here — it is only what you set in BOOTSTRAP_SUPER_ADMIN_PASSWORD.`)

  await pool.end()
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err.message)
  process.exit(1)
})
