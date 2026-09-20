import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { getMatchFeedback, postMatchFeedback } from '../controllers/matchFeedback.controller.js'

// Mounted at /api/matches. requireAuth only — eligibility (participant /
// assigned umpire / ground owner) is computed per-match, per-user inside
// the service, the same posture umpireAssignment.routes.js already uses for
// apply/cancel (a role middleware can't express "eligible for THIS match").
const router = Router()
router.get('/:matchId/feedback', requireAuth, getMatchFeedback)
router.post('/:matchId/feedback', requireAuth, postMatchFeedback)

export default router
