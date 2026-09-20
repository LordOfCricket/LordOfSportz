import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { attachGroundContext } from '../middlewares/groundAccess.js'
import { bookingWriteLimiter } from '../middlewares/rateLimit.js'
import {
  createMatchProposal,
  listOpenProposals,
  getMatchProposal,
  acceptMatchProposal,
  cancelMatchProposal,
} from '../controllers/matchProposal.controller.js'

// Phase 25 — mounted at /grounds/:publicGroundId/proposals (index.js).
// Discovery (list/detail) is public — no login needed to browse who's
// looking for an opponent, same posture as GET /bookings/availability.
// Creating/accepting/cancelling requires auth; team authorization itself is
// enforced entirely in matchProposal.service.js, never trusted from the URL
// or request body.

const router = Router({ mergeParams: true })

router.get('/', attachGroundContext, listOpenProposals)
router.get('/:publicProposalId', attachGroundContext, getMatchProposal)

router.post('/', bookingWriteLimiter, requireAuth, attachGroundContext, createMatchProposal)
router.post('/:publicProposalId/accept', bookingWriteLimiter, requireAuth, attachGroundContext, acceptMatchProposal)
router.post('/:publicProposalId/cancel', bookingWriteLimiter, requireAuth, attachGroundContext, cancelMatchProposal)

export default router
