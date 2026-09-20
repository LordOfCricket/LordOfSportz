import { findAuctionById } from '../repositories/prisma/auction.prisma-repository.js'
import { findActiveMembershipForAnyRole } from '../models/groundUser.model.js'
import { respondMfaRequired } from '../services/mfaState.service.js'

// Auction-scoped authorization, built on the same primitives
// middlewares/groundAccess.js already uses (ground_users membership lookup
// keyed off req.user.id, Super Admin bypass, MFA gate) rather than a second
// permission system.
//
// The difference from requireGroundRole is only how the ground is reached:
// there it comes from :publicGroundId directly, here it is resolved through
// the auction row (:auctionId -> auction.ground_id). The client-supplied
// auction id therefore only selects WHICH auction is being asked about;
// authorization still comes from a membership row, never from the id.
//
// Must run after requireAuth (needs req.user).

function isSuperAdmin(user) {
  return user?.role === 'staff' && user?.staff_role === 'super_admin'
}

// Manage-level access: create/configure/start/complete an auction. Mirrors
// requireGroundRole('GROUND_OWNER') exactly, including its MFA mandate for
// both the Super Admin bypass and the GROUND_OWNER branch.
export function requireAuctionManager() {
  return async (req, res, next) => {
    try {
      const auction = await findAuctionById(req.params.auctionId)
      if (!auction) {
        return res.status(404).json({ error: 'Auction not found.' })
      }

      if (isSuperAdmin(req.user)) {
        if (!req.mfaVerified) return respondMfaRequired(res)
        req.auction = auction
        return next()
      }

      const membership = await findActiveMembershipForAnyRole(req.user.id, auction.ground_id, ['GROUND_OWNER'])
      if (!membership) {
        return res.status(403).json({ error: 'You do not have permission to manage this auction.' })
      }
      if (!req.mfaVerified) return respondMfaRequired(res)

      req.auction = auction
      req.groundMembership = membership
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Read-level access: view an auction and its lots/participants. Any
// authenticated member of the auction's ground can read it, as can a
// participating team's own members once Phase B introduces bidding — for now
// this is ground-scoped only, deliberately narrower than "any authenticated
// user", so an auction is never enumerable across grounds.
export function requireAuctionViewer() {
  return async (req, res, next) => {
    try {
      const auction = await findAuctionById(req.params.auctionId)
      if (!auction) {
        return res.status(404).json({ error: 'Auction not found.' })
      }

      if (isSuperAdmin(req.user)) {
        req.auction = auction
        return next()
      }

      const membership = await findActiveMembershipForAnyRole(
        req.user.id,
        auction.ground_id,
        ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF'],
      )
      if (!membership) {
        return res.status(403).json({ error: 'You do not have permission to view this auction.' })
      }

      req.auction = auction
      req.groundMembership = membership
      next()
    } catch (err) {
      next(err)
    }
  }
}
