import { findUserByEmail, findAllStaffUsers } from '../models/user.model.js'
import { createPlatformStaff } from '../services/staffAccount.service.js'
import { validatePasswordPolicy } from '../domain/otpAuth/password.js'
import { findLatestAdminLoginTimestamps } from '../models/accountAuditLog.model.js'
import { hasAnyActiveFactor } from '../services/mfaState.service.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — 'super_admin' added.
// Creating one now goes through this exact same step-up-gated flow (see
// staffAccount.service.js's own comment on why this isn't a second,
// separate "create a super admin" code path) — the brief's "small trusted
// set of SUPER_ADMIN users" constraint is preserved by WHO can call this
// (super_admin-only, step-up-gated), not by walling super_admin off into
// its own mechanism.
const CREATABLE_STAFF_ROLES = ['admin', 'canteen_staff', 'super_admin']

// Phase 6 — creating a platform staff account is step-up-gated (see
// services/staffAccount.service.js): the actual mutation + step-up
// consumption happens there, atomically. Everything here is unchanged
// pre-existing input validation, run before that call.
export async function createStaff(req, res, next) {
  try {
    const { name, email, password, staffId, role, username } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' })
    }
    // SUPER_ADMIN Identity & Secure Provisioning feature — unifies onto the
    // same 8–128 char, no-forced-complexity policy every other password
    // path in this app already uses (domain/otpAuth/password.js), rather
    // than this endpoint's own weaker inline 6-char minimum.
    const policy = validatePasswordPolicy(password)
    if (!policy.valid) {
      return res.status(400).json({ message: policy.reason })
    }
    if (!CREATABLE_STAFF_ROLES.includes(role)) {
      return res.status(400).json({ message: "role must be 'admin', 'canteen_staff', or 'super_admin'" })
    }

    const existing = await findUserByEmail(email)
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' })
    }

    try {
      const user = await createPlatformStaff({ name, email, password, staffId, role, username: username || null }, req.session?.id, req.user.id)
      res.status(201).json({ user })
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ message: 'That Staff ID or Username is already in use.' })
      }
      throw err
    }
  } catch (err) {
    next(err)
  }
}

// SUPER_ADMIN Identity & Secure Provisioning feature — "Admin Management"
// list. super_admin-only (routes.js), mirrors the shape of every other
// admin list endpoint in this codebase.
export async function listStaff(req, res, next) {
  try {
    const [staff, lastLogins] = await Promise.all([findAllStaffUsers(), findLatestAdminLoginTimestamps()])
    const enriched = await Promise.all(
      staff.map(async (s) => ({
        ...s,
        mfaEnabled: await hasAnyActiveFactor(s.id),
        lastLoginAt: lastLogins.get(s.id) || null,
      })),
    )
    res.json({ staff: enriched })
  } catch (err) {
    next(err)
  }
}
