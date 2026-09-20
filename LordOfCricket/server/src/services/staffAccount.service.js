import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { createStaffUser } from '../models/user.model.js'
import { findStaffRoleByName } from '../models/staffRole.model.js'
import { consumeStepUpGrant } from './stepUp.service.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { generateAdminId } from '../utils/adminId.js'
import { MfaError, MFA_ERROR_CODES } from '../domain/mfa/errors.js'
import { logger } from '../utils/logger.js'

// Phase 6 — platform staff creation (staff.controller.js) is one of the
// two Super-Admin actions the brief specifically names as step-up-gated
// (it creates a new privileged platform account). This is genuinely new
// business logic (step-up consumption inside a transaction), so it now
// lives in its own service rather than directly in the controller — the
// controller previously had no service to call at all, since this flow
// predates the Route -> Controller -> Service -> Model layering
// established elsewhere in this codebase. The pre-existing duplicate-email
// check (409, with its own message) stays in the controller, run BEFORE
// this is called, unchanged — this function only wraps the actual mutation
// + step-up consumption in one transaction, preserving the exact prior
// behavior/race profile (the unique constraint on users.email was always
// the real backstop, never the pre-check).
// SUPER_ADMIN Identity & Secure Provisioning feature — `role` may now also
// be 'super_admin' (staff.controller.js#CREATABLE_STAFF_ROLES was extended
// to allow it), reusing this exact same step-up-gated flow rather than a
// separate "create a super admin" mechanism — creating any platform staff
// account is already treated as sensitive here, and a super_admin isn't
// categorically different enough to warrant a second code path. When the
// caller doesn't supply a staffId AND the role is super_admin, one is
// auto-generated in the existing "LOC-ADM-001" Admin ID format (see
// utils/adminId.js) — admin/canteen_staff keep their prior optional
// free-text behavior, unchanged. `username` is the new, purely
// display/reference field (see its schema.sql comment); `forcePasswordChange`
// lets the bootstrap script (server/src/scripts/bootstrapSuperAdmin.js)
// reuse this exact function too, rather than duplicating the INSERT.
export async function createPlatformStaff({ name, email, password, staffId, role, username = null, forcePasswordChange = false }, sessionId, actorUserId = null) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const grant = await consumeStepUpGrant(sessionId, 'STAFF_CREATE', client)
    if (!grant) {
      throw new MfaError(MFA_ERROR_CODES.STEP_UP_REQUIRED, 'This action requires a fresh step-up verification.')
    }

    const staffRole = await findStaffRoleByName(role)
    const resolvedStaffId = staffId || (role === 'super_admin' ? await generateAdminId(client) : null)
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await createStaffUser(
      { name, email, passwordHash, staffId: resolvedStaffId, staffRoleId: staffRole.id, username, forcePasswordChange },
      client,
    )

    // Pre-existing gap this feature fixes — STAFF_CREATED was never
    // recorded for platform staff (only for Ground-Owner-created ground
    // staff, a different flow — see groundStaff.service.js).
    await recordEvent(ACCOUNT_AUDIT_EVENTS.STAFF_CREATED, { actorUserId, targetUserId: user.id, metadata: { role, staffId: resolvedStaffId } }, client)

    await client.query('COMMIT')
    logger.info('Platform staff created', { userId: user.id, role })
    return user
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
