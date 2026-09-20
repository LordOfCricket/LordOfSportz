import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { listUmpireSlots, applyForUmpireSlot, cancelUmpireAssignment } from '../controllers/umpireAssignment.controller.js'

// Mounted at /api/matches. requireAuth only (not requireScorer/
// requireMatchScorer) — apply/cancel are how a user BECOMES an assigned
// umpire in the first place, so Gate 2 (match-scoped assignment) can't be
// checked yet; Gate 1 (approved umpire) is re-checked inside the service.
const router = Router()
router.get('/:matchId/umpire-slots', requireAuth, listUmpireSlots)
router.post('/:matchId/umpire-slots/apply', requireAuth, applyForUmpireSlot)
router.post('/:matchId/umpire-slots/cancel', requireAuth, cancelUmpireAssignment)

export default router
