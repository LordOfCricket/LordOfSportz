// SUPER_ADMIN Identity & Secure Provisioning feature — "Ground Owners"
// (§12), "Players"/"Umpires" (§5 sidebar), and admin-initiated password
// recovery (§13).
import { findAllGroundOwners, findAllUmpires, findUserById } from '../models/user.model.js'
import { findGroundsOwnedByUser } from '../models/groundUser.model.js'
import { findAllPlayersForAdmin } from '../models/player.model.js'
import { generateTemporaryCredential } from '../services/adminPasswordRecovery.service.js'

export async function listGroundOwners(req, res, next) {
  try {
    const owners = await findAllGroundOwners()
    res.json({
      owners: owners.map((o) => ({
        userId: o.id,
        name: o.name,
        email: o.email,
        phone: o.phone,
        status: o.status,
        groundCount: o.ground_count,
        createdAt: o.created_at,
      })),
    })
  } catch (err) {
    next(err)
  }
}

// Ground Owner's own grounds — reuses the EXISTING findGroundsOwnedByUser
// (groundUser.model.js), not a duplicate query, for the "View grounds"
// action off the Ground Owners list.
export async function getGroundOwnerGrounds(req, res, next) {
  try {
    const grounds = await findGroundsOwnedByUser(Number(req.params.userId))
    res.json({ grounds: grounds.map((g) => ({ publicGroundId: g.public_ground_id, name: g.name, city: g.city, state: g.state, status: g.status })) })
  } catch (err) {
    next(err)
  }
}

export async function listPlayers(req, res, next) {
  try {
    const players = await findAllPlayersForAdmin()
    res.json({
      players: players.map((p) => ({
        userId: p.user_id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        status: p.status,
        publicPlayerId: p.public_player_id,
        jerseyNumber: p.jersey_number,
        city: p.city,
        createdAt: p.created_at,
      })),
    })
  } catch (err) {
    next(err)
  }
}

export async function listUmpires(req, res, next) {
  try {
    const umpires = await findAllUmpires()
    res.json({
      umpires: umpires.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        umpireRequestStatus: u.umpire_request_status,
        createdAt: u.created_at,
      })),
    })
  } catch (err) {
    next(err)
  }
}

// Admin-initiated password recovery (§13) — never returns/exposes the
// user's EXISTING password (impossible — only a hash is ever stored); the
// generated temporary credential is returned exactly once, here, to the
// acting Super Admin, and nowhere else (never logged — see
// adminPasswordRecovery.service.js's own comment).
export async function resetUserPassword(req, res, next) {
  try {
    const targetUserId = Number(req.params.userId)
    const targetUser = await findUserById(targetUserId)
    if (!targetUser) {
      return res.status(404).json({ message: 'Account not found.' })
    }

    const { expiresAt } = await generateTemporaryCredential(targetUserId, req.user, req.session?.id)

    res.json({
      success: true,
      emailSent: true,
      expiresAt,
      targetUser: { id: targetUser.id, name: targetUser.name, email: targetUser.email },
      message: 'Password recovery initiated. A temporary password has been sent to the user\'s registered email. The temporary password will expire in 30 minutes.',
    })
  } catch (err) {
    next(err)
  }
}
