import { Router } from 'express'
import { listTopUmpires } from '../controllers/umpireLeaderboard.controller.js'

// Umpire Intelligence & Scale 2.0, Workstreams T/U — mounted at /api/stats
// alongside (not merged into) the existing player leaderboardRoutes,
// same public-read posture as the player leaderboard's own precedent.
export const topUmpiresRoutes = Router()
topUmpiresRoutes.get('/top-umpires', listTopUmpires)
