import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { aiLimiter } from '../middlewares/rateLimit.js'
import { requireIntParam } from '../middlewares/validateParams.js'
import { getMatchInsight, getPlayerInsight, getTeamInsight, regenerateMatchInsight, regeneratePlayerInsight, regenerateTeamInsight } from '../controllers/aiInsight.controller.js'

// Phase 16 — mounted onto the EXISTING /matches, /players, /teams route
// prefixes (routes/index.js), matching every other feature-specific route
// file already mounted alongside a base resource's own router (e.g.
// matchAvailabilityRoutes onto /matches).

export const matchAIInsightRoutes = Router()
matchAIInsightRoutes.get('/:id/ai-insight', requireIntParam('id'), aiLimiter, getMatchInsight)
matchAIInsightRoutes.post('/:id/ai-insight/regenerate', requireIntParam('id'), aiLimiter, requireAuth, requireRole('staff'), regenerateMatchInsight)

export const playerAIInsightRoutes = Router()
playerAIInsightRoutes.get('/:publicPlayerId/ai-insight', aiLimiter, getPlayerInsight)
playerAIInsightRoutes.post('/:publicPlayerId/ai-insight/regenerate', aiLimiter, requireAuth, requireRole('staff'), regeneratePlayerInsight)

export const teamAIInsightRoutes = Router()
teamAIInsightRoutes.get('/:id/ai-insight', requireIntParam('id'), aiLimiter, getTeamInsight)
teamAIInsightRoutes.post('/:id/ai-insight/regenerate', requireIntParam('id'), aiLimiter, requireAuth, requireRole('staff'), regenerateTeamInsight)
