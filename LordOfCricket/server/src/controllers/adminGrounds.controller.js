// SUPER_ADMIN Identity & Secure Provisioning feature — "All Grounds" (§11).
import { findAllGroundsForAdmin, suspendGround, reactivateGround } from '../models/ground.model.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from '../services/accountAudit.service.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'

function serializeGround(row) {
  return {
    publicGroundId: row.public_ground_id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    status: row.status,
    ownerName: row.owner_name,
    createdAt: row.created_at,
  }
}

export async function listAllGrounds(req, res, next) {
  try {
    const grounds = await findAllGroundsForAdmin()
    res.json({ grounds: grounds.map(serializeGround) })
  } catch (err) {
    next(err)
  }
}

// Suspend/Reactivate — same "negative/corrective admin action" leverage as
// reject/request-information on ground_owner_requests (docs/MFA.md's own
// step-up "negative space" list), so this is requireStaffRole('super_admin')
// alone (MFA-verified via that gate already) — no additional step-up,
// mirroring reject's precedent rather than approve's.
export async function suspend(req, res, next) {
  try {
    const ground = await suspendGround(req.params.publicGroundId)
    if (!ground) {
      throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, 'Ground not found or not currently active.')
    }
    await recordEvent(ACCOUNT_AUDIT_EVENTS.GROUND_SUSPENDED, { actorUserId: req.user.id, metadata: { groundPublicId: ground.public_ground_id, groundName: ground.name } })
    res.json({ ground: serializeGround(ground) })
  } catch (err) {
    next(err)
  }
}

export async function reactivate(req, res, next) {
  try {
    const ground = await reactivateGround(req.params.publicGroundId)
    if (!ground) {
      throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, 'Ground not found or not currently suspended.')
    }
    await recordEvent(ACCOUNT_AUDIT_EVENTS.GROUND_REACTIVATED, { actorUserId: req.user.id, metadata: { groundPublicId: ground.public_ground_id, groundName: ground.name } })
    res.json({ ground: serializeGround(ground) })
  } catch (err) {
    next(err)
  }
}
