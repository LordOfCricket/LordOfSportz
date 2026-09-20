import { pool } from '../config/db.js'
import { findUserByIdentifier, createUserFromOtp } from '../models/user.model.js'
import { createMembership, findMembershipsByGroundIdAndRoles, findMembershipById, setMembershipActive, findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import * as notificationService from './groundNotification.service.js'
import {
  findPermissionByKey,
  listAllPermissions,
  findActiveGrant,
  grantPermission as grantPermissionRow,
  revokePermission as revokePermissionRow,
  findActivePermissionsForGroundUserIds,
} from '../models/permission.model.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { consumeStepUpGrant } from './stepUp.service.js'
import { detectIdentifierType, normalizeIdentifier } from '../domain/otpAuth/otp.js'
import { requiredText } from '../domain/accountCreation/validation.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'
import { MfaError, MFA_ERROR_CODES } from '../domain/mfa/errors.js'
import { logger } from '../utils/logger.js'

// Phase 6 — thrown when a step-up-gated mutation's grant is missing,
// expired, or already used. Callers must ROLLBACK (their existing catch
// block already does this for every thrown error) — see
// stepUp.service.js#consumeStepUpGrant's own header comment for why this
// check runs FIRST, inside the same transaction as the mutation itself.
async function requireFreshStepUp(sessionId, actionScope, client) {
  const grant = await consumeStepUpGrant(sessionId, actionScope, client)
  if (!grant) {
    throw new MfaError(MFA_ERROR_CODES.STEP_UP_REQUIRED, 'This action requires a fresh step-up verification.')
  }
}

const CREATABLE_GROUND_STAFF_ROLES = ['GROUND_ADMIN', 'CANTEEN_STAFF']

// Ground-scoped staff — distinct from the platform-wide staff_roles system
// (server/src/controllers/staff.controller.js, untouched by this phase).
// `ground` here is the row requireGroundRole('GROUND_OWNER') already
// resolved and verified the caller owns (middlewares/groundAccess.js) — the
// "owner cannot create staff for another owner's ground" boundary is
// enforced entirely by that existing middleware before this function is
// ever called, not re-implemented here.
export async function createStaffForGround(ground, { name, identifier, role }, actorUserId) {
  if (!CREATABLE_GROUND_STAFF_ROLES.includes(role)) {
    throw new AccountCreationError(CODES.STAFF_ROLE_INVALID, `role must be one of: ${CREATABLE_GROUND_STAFF_ROLES.join(', ')}`)
  }

  const nameResult = requiredText(name, 100)
  if (nameResult.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Staff name is required.')

  const identifierType = detectIdentifierType(identifier)
  if (!identifierType) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Enter a valid email address or phone number.')
  const normalizedIdentifier = normalizeIdentifier(identifier, identifierType)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // An identifier that already belongs to someone (a player, another
    // ground's staff, anyone) gets a NEW membership on THIS ground added to
    // their EXISTING account — users.role is never touched, so an existing
    // Player's identity is never silently overwritten into 'staff'. Only a
    // genuinely new identifier creates a fresh user, with role='staff'.
    let user = await findUserByIdentifier(normalizedIdentifier, identifierType, client)
    if (!user) {
      user = await createUserFromOtp({ identifier: normalizedIdentifier, identifierType, name: nameResult.value, role: 'staff' }, client)
    }

    let membership
    try {
      membership = await createMembership({ groundId: ground.id, userId: user.id, role, isActive: true }, client)
    } catch (err) {
      if (err.code === '23505') {
        throw new AccountCreationError(CODES.IDENTIFIER_ALREADY_REGISTERED, 'This person already has this role at this ground.')
      }
      throw err
    }

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.STAFF_CREATED,
      { actorUserId, targetUserId: user.id, metadata: { groundPublicId: ground.public_ground_id, role } },
      client,
    )

    await client.query('COMMIT')
    logger.info('Ground staff created', { groundPublicId: ground.public_ground_id, userId: user.id, role })
    const { password_hash, ...publicUser } = user
    return { user: publicUser, membership }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function listStaffForGround(ground) {
  const rows = await findMembershipsByGroundIdAndRoles(ground.id, CREATABLE_GROUND_STAFF_ROLES)
  const grants = await findActivePermissionsForGroundUserIds(rows.map((row) => row.id))
  const permissionsByMembershipId = new Map()
  for (const grant of grants) {
    const list = permissionsByMembershipId.get(grant.ground_user_id) || []
    list.push(grant.key)
    permissionsByMembershipId.set(grant.ground_user_id, list)
  }

  return rows.map((row) => ({
    userId: row.user_id,
    name: row.user_name,
    email: row.user_email,
    phone: row.user_phone,
    role: row.role,
    membershipId: row.id,
    createdAt: row.created_at,
    permissions: permissionsByMembershipId.get(row.id) || [],
  }))
}

// Phase 5 — the static permission catalog, ground-agnostic (the same 4
// permissions exist for every ground), used to render the grant/revoke UI.
export async function listPermissionCatalog() {
  const rows = await listAllPermissions()
  return rows.map((row) => ({ key: row.key, description: row.description }))
}

// Phase 5 — the IDOR guard every grant/revoke/disable endpoint needs.
// requireGroundRole('GROUND_OWNER') only proves the caller owns
// :publicGroundId; it says nothing about whether a client-supplied
// :membershipId actually belongs to THAT ground. Mirrors
// groundOwner.service.js's own resolveOwnedMatch pattern ("re-verifies
// match.ground_id on every action"). Also refuses to ever target a
// GROUND_OWNER membership row — defense-in-depth on top of the fact that no
// route lets a non-owner reach this far in the first place.
async function resolveOwnedStaffMembership(ground, membershipId) {
  const membership = await findMembershipById(membershipId)
  if (!membership || membership.ground_id !== ground.id) {
    throw new AccountCreationError(CODES.MEMBERSHIP_NOT_FOUND, 'Staff member not found for this ground.')
  }
  if (!CREATABLE_GROUND_STAFF_ROLES.includes(membership.role)) {
    throw new AccountCreationError(CODES.MEMBERSHIP_ROLE_INVALID, 'This operation cannot target a ground owner membership.')
  }
  return membership
}

async function resolvePermissionOrThrow(permissionKey) {
  const permission = await findPermissionByKey(permissionKey)
  if (!permission) {
    throw new AccountCreationError(CODES.PERMISSION_KEY_INVALID, `Unknown permission key: ${permissionKey}`)
  }
  return permission
}

export async function grantStaffPermission(ground, membershipId, permissionKey, actorUserId, sessionId) {
  const membership = await resolveOwnedStaffMembership(ground, membershipId)
  const permission = await resolvePermissionOrThrow(permissionKey)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await requireFreshStepUp(sessionId, 'PERMISSION_GRANT', client)

    const existing = await findActiveGrant(membership.id, permission.id)
    if (existing) {
      throw new AccountCreationError(CODES.PERMISSION_ALREADY_GRANTED, 'This staff member already has this permission.')
    }

    // Phase 7 — the check above is a plain SELECT-then-INSERT, not a guard
    // against two concurrent grant requests for the same membership+
    // permission; idx_staff_permissions_active_unique (schema.sql) is the
    // real guarantee, backstopping this exactly like createStaffForGround's
    // membership insert and applyForSlot's slot claim already catch their
    // own 23505 races instead of letting the loser crash with a raw 500.
    try {
      await grantPermissionRow({ groundUserId: membership.id, permissionId: permission.id, grantedBy: actorUserId }, client)
    } catch (err) {
      if (err.code === '23505') {
        throw new AccountCreationError(CODES.PERMISSION_ALREADY_GRANTED, 'This staff member already has this permission.')
      }
      throw err
    }

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.PERMISSION_GRANTED,
      { actorUserId, targetUserId: membership.user_id, metadata: { groundPublicId: ground.public_ground_id, membershipId: membership.id, permissionKey } },
      client,
    )

    await client.query('COMMIT')
    logger.info('Staff permission granted', { groundPublicId: ground.public_ground_id, membershipId: membership.id, permissionKey })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function revokeStaffPermission(ground, membershipId, permissionKey, actorUserId) {
  const membership = await resolveOwnedStaffMembership(ground, membershipId)
  const permission = await resolvePermissionOrThrow(permissionKey)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const revoked = await revokePermissionRow({ groundUserId: membership.id, permissionId: permission.id, revokedBy: actorUserId }, client)
    if (!revoked) {
      throw new AccountCreationError(CODES.PERMISSION_NOT_GRANTED, 'This staff member does not currently have this permission.')
    }

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.PERMISSION_REVOKED,
      { actorUserId, targetUserId: membership.user_id, metadata: { groundPublicId: ground.public_ground_id, membershipId: membership.id, permissionKey } },
      client,
    )

    await client.query('COMMIT')
    logger.info('Staff permission revoked', { groundPublicId: ground.public_ground_id, membershipId: membership.id, permissionKey })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Deactivates the membership itself (not a permission) — the existing
// ground_users.is_active flag, already read by every authorization check
// (findActiveMembershipForAnyRole/requireGroundPermission) but never
// previously set to false by any controller. Takes effect immediately: no
// session/JWT caches role or permission state.
export async function disableStaffMembership(ground, membershipId, actorUserId, sessionId, io = null) {
  const membership = await resolveOwnedStaffMembership(ground, membershipId)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await requireFreshStepUp(sessionId, 'STAFF_DISABLE', client)

    await setMembershipActive(membership.id, false, client)

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.STAFF_DISABLED,
      { actorUserId, targetUserId: membership.user_id, metadata: { groundPublicId: ground.public_ground_id, membershipId: membership.id } },
      client,
    )

    await client.query('COMMIT')
    logger.info('Ground staff disabled', { groundPublicId: ground.public_ground_id, membershipId: membership.id })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }

  // Phase 15 — Ground Owner notification, strictly AFTER commit (never
  // allowed to affect the disable itself). Notifies every active owner of
  // this ground (a multi-owner ground's co-owners stay in sync), not just
  // the actor — same "notify every owner" posture as the booking triggers.
  const ownerUserIds = await findActiveGroundOwnerUserIds(ground.id)
  await Promise.all(
    ownerUserIds.map((ownerUserId) =>
      notificationService.createNotification({
        userId: ownerUserId,
        type: 'GROUND_STAFF_DEACTIVATED',
        title: 'Staff member deactivated',
        body: 'A staff member’s access to this ground was deactivated.',
        groundId: ground.id,
        io,
      }),
    ),
  )
}
