import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireMatchScorerByParam } from '../middlewares/matchScorerAccess.js'
import { getMyAvailability, setMyAvailability, listMatchAvailability } from '../controllers/matchAvailability.controller.js'

// Mounted at /api/matches
const router = Router()
router.get('/:matchId/availability', requireAuth, requireMatchScorerByParam('matchId'), listMatchAvailability)
export default router

// Mounted at /api/me
export const meAvailabilityRoutes = Router()
meAvailabilityRoutes.get('/availability/:matchId', requireAuth, getMyAvailability)
meAvailabilityRoutes.patch('/availability/:matchId', requireAuth, setMyAvailability)
