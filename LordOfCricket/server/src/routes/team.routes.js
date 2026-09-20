import { Router } from 'express'
import { listTeams, getTeam, listTeamPlayers, getPublicTeams, getTeamProfile, addTeamPlayer, removeTeamPlayer, createTeam } from '../controllers/team.controller.js'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { searchLimiter } from '../middlewares/rateLimit.js'
import { requireIntParam } from '../middlewares/validateParams.js'

const router = Router()

// Phase 10 Part 2 — public team ecosystem. Registered before '/:id' so
// 'discover' is never swallowed as a team id.
router.get('/discover', searchLimiter, getPublicTeams)

// Public — team name/short-name/logo carry no privacy concern, and Phase 8's
// public Player Discovery / Leaderboards pages need this for their team
// filter dropdown without requiring a login (same public-read posture as
// GET /matches).
router.get('/', listTeams)
router.get('/:id/profile', requireIntParam('id'), getTeamProfile)
router.get('/:id', requireIntParam('id'), requireAuth, getTeam)
router.get('/:id/players', requireIntParam('id'), requireAuth, listTeamPlayers)

// Phase 5D.4 — authenticated players can create teams (owner becomes authenticated user)
router.post('/', requireAuth, requireRole('player'), createTeam)

// Phase 13 — staff-only team roster management (join/leave a team's squad).
router.post('/:id/players', requireIntParam('id'), requireAuth, requireRole('staff'), addTeamPlayer)
router.delete('/:id/players/:publicPlayerId', requireIntParam('id'), requireAuth, requireRole('staff'), removeTeamPlayer)

export default router
