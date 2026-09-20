import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { searchLimiter } from '../middlewares/rateLimit.js'
import { getPlayerStats, getMyStats, getLeaderboard, getCricketRecords, searchPlayersHandler, getPublicPlayerInfo } from '../controllers/statistics.controller.js'

// Mounted at /api/players — all public (no auth), consistent with the
// existing public-read posture of GET /matches. Search/discovery and public
// cricket profiles are intentionally readable by anyone; only the PRIVATE
// self endpoints (/me/*) stay behind requireAuth.
export const playerStatsRoutes = Router()
playerStatsRoutes.get('/', searchLimiter, searchPlayersHandler)
playerStatsRoutes.get('/:publicPlayerId', getPublicPlayerInfo)
playerStatsRoutes.get('/:publicPlayerId/stats', getPlayerStats)

// Mounted at /api/me
export const meStatsRoutes = Router()
meStatsRoutes.get('/stats', requireAuth, getMyStats)

// Mounted at /api/stats
export const leaderboardRoutes = Router()
leaderboardRoutes.get('/leaderboards/:metric', getLeaderboard)
// Priority 3 — LOC Cricket Records (match & team records). Distinct path from
// /leaderboards/:metric, public read, same posture as the leaderboards above.
leaderboardRoutes.get('/records', getCricketRecords)
