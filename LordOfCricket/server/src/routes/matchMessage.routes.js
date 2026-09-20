import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireIntParam } from '../middlewares/validateParams.js'
import { listMatchMessages, sendMatchMessage } from '../controllers/matchMessage.controller.js'

// Mounted at /api/matches. requireAuth only — the real gate (is this user a
// genuine participant in THIS match) is service-level (matchAccess.service.js),
// same shape as umpireAssignmentRoutes' apply/cancel routes.
const router = Router()
router.get('/:matchId/messages', requireIntParam('matchId'), requireAuth, listMatchMessages)
router.post('/:matchId/messages', requireIntParam('matchId'), requireAuth, sendMatchMessage)

export default router
