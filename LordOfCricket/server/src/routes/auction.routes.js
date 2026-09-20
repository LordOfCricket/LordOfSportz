import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundRole } from '../middlewares/groundAccess.js'
import { requireAuctionManager, requireAuctionViewer } from '../middlewares/auctionAccess.js'
import * as auctionController from '../controllers/auction.controller.js'

// Two route groups, because they resolve their ground differently:
//
//   /grounds/:publicGroundId/auctions  — ground known from the URL, so the
//     existing requireGroundRole('GROUND_OWNER') applies directly.
//   /auctions/:auctionId/...           — ground reached through the auction
//     row, so requireAuctionManager/Viewer resolve it (same membership lookup,
//     same Super Admin bypass, same MFA gate).
//
// Neither group ever trusts a ground/team/player id from the request body for
// authorization.

export const groundAuctionRouter = Router({ mergeParams: true })

groundAuctionRouter.post(
  '/',
  requireAuth,
  requireGroundRole('GROUND_OWNER'),
  auctionController.createAuction,
)
groundAuctionRouter.get(
  '/',
  requireAuth,
  requireGroundRole('GROUND_OWNER'),
  auctionController.listAuctions,
)

const router = Router()

router.get('/:auctionId', requireAuth, requireAuctionViewer(), auctionController.getAuction)
router.get('/:auctionId/lots', requireAuth, requireAuctionViewer(), auctionController.listLots)
router.get('/:auctionId/purse', requireAuth, requireAuctionViewer(), auctionController.getPurse)

router.post('/:auctionId/participants', requireAuth, requireAuctionManager(), auctionController.addParticipant)
router.delete(
  '/:auctionId/participants/:participantId',
  requireAuth,
  requireAuctionManager(),
  auctionController.removeParticipant,
)
router.post('/:auctionId/lots', requireAuth, requireAuctionManager(), auctionController.addLot)

router.post('/:auctionId/ready', requireAuth, requireAuctionManager(), auctionController.markReady)
router.post('/:auctionId/start', requireAuth, requireAuctionManager(), auctionController.startAuction)
router.post('/:auctionId/pause', requireAuth, requireAuctionManager(), auctionController.pauseAuction)
router.post('/:auctionId/resume', requireAuth, requireAuctionManager(), auctionController.resumeAuction)
router.post('/:auctionId/complete', requireAuth, requireAuctionManager(), auctionController.completeAuction)
router.post('/:auctionId/cancel', requireAuth, requireAuctionManager(), auctionController.cancelAuction)

export default router
