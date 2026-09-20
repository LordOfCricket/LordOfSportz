import { updateCanteenActiveStatus } from '../models/canteen.model.js'
import { logger } from '../utils/logger.js'

// Phase 24 — Ground Owner self-service canteen activate/deactivate.
// req.canteen/req.ground are already server-resolved and ownership-verified
// by requireGroundCanteenRole (routes/canteenStatus.routes.js) before this
// ever runs — the canteen being modified is never taken from the request
// body, only from that already-authorized, tenant-scoped context. The
// actual "no new orders while inactive" enforcement already exists and is
// unchanged (canteenOrder.controller.js#createOrder's Phase 17.2 check) —
// this endpoint only flips the flag that check already reads.
export async function updateCanteenStatus(req, res, next) {
  try {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean.' })
    }

    const updated = await updateCanteenActiveStatus(req.canteen.id, isActive)
    if (!updated) {
      return res.status(404).json({ error: 'Canteen not found.' })
    }

    logger.info(isActive ? 'Canteen activated' : 'Canteen deactivated', {
      groundPublicId: req.ground.public_ground_id,
      canteenPublicId: updated.public_canteen_id,
    })

    res.json({
      canteen: {
        publicCanteenId: updated.public_canteen_id,
        name: updated.name,
        isActive: updated.is_active,
      },
    })
  } catch (err) {
    next(err)
  }
}
