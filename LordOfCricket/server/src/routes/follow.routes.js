import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireIntParam } from '../middlewares/validateParams.js'
import {
  followPlayerHandler,
  unfollowPlayerHandler,
  playerFollowStateHandler,
  followTeamHandler,
  unfollowTeamHandler,
  teamFollowStateHandler,
  followGroundHandler,
  unfollowGroundHandler,
  groundFollowStateHandler,
  listFollowingHandler,
} from '../controllers/follow.controller.js'

// Priority 1 — Follow Players / Teams. Same "small per-resource router
// mounted alongside the base resource" pattern as analytics/aiInsight/
// matchAvailability. All routes are authenticated (a follow is personal
// user state); the public player/team profiles themselves stay public.

// Mounted at /api/players
export const playerFollowRoutes = Router()
playerFollowRoutes.get('/:publicPlayerId/follow', requireAuth, playerFollowStateHandler)
playerFollowRoutes.post('/:publicPlayerId/follow', requireAuth, followPlayerHandler)
playerFollowRoutes.delete('/:publicPlayerId/follow', requireAuth, unfollowPlayerHandler)

// Mounted at /api/teams
export const teamFollowRoutes = Router()
teamFollowRoutes.get('/:id/follow', requireIntParam('id'), requireAuth, teamFollowStateHandler)
teamFollowRoutes.post('/:id/follow', requireIntParam('id'), requireAuth, followTeamHandler)
teamFollowRoutes.delete('/:id/follow', requireIntParam('id'), requireAuth, unfollowTeamHandler)

// Mounted at /api/grounds. Priority 5 — Favorite Grounds. `/:publicGroundId/
// follow` is an extra segment past the public `/:publicGroundId` profile
// route (ground.routes.js), so mount order doesn't matter — same reasoning
// as the player/team follow routers above.
export const groundFollowRoutes = Router()
groundFollowRoutes.get('/:publicGroundId/follow', requireAuth, groundFollowStateHandler)
groundFollowRoutes.post('/:publicGroundId/follow', requireAuth, followGroundHandler)
groundFollowRoutes.delete('/:publicGroundId/follow', requireAuth, unfollowGroundHandler)

// Mounted at /api/me
export const meFollowingRoutes = Router()
meFollowingRoutes.get('/following', requireAuth, listFollowingHandler)
