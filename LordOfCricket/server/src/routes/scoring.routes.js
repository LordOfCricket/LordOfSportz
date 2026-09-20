import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireMatchScorerByParam, requireMatchScorerByInnings } from '../middlewares/matchScorerAccess.js'
import {
  createInnings,
  listInnings,
  addMatchPlayer,
  listMatchPlayers,
  getInningsState,
  getInningsTimeline,
  getWagonWheel,
  recordDelivery,
  recordEvent,
} from '../controllers/scoring.controller.js'
import { previewCorrection, applyCorrection, listCorrections, undoCorrection } from '../controllers/correction.controller.js'
import { requireIntParam } from '../middlewares/validateParams.js'

// Mounted at /api/matches
export const matchScoringRoutes = Router()
matchScoringRoutes.get('/:matchId/match-players', listMatchPlayers)
matchScoringRoutes.post('/:matchId/match-players', requireAuth, requireMatchScorerByParam('matchId'), addMatchPlayer)
matchScoringRoutes.get('/:matchId/innings', listInnings)
matchScoringRoutes.post('/:matchId/innings', requireAuth, requireMatchScorerByParam('matchId'), createInnings)

// Mounted at /api/innings
export const inningsScoringRoutes = Router()
inningsScoringRoutes.get('/:inningsId/state', requireIntParam('inningsId'), getInningsState)
inningsScoringRoutes.get('/:inningsId/timeline', requireIntParam('inningsId'), getInningsTimeline)
inningsScoringRoutes.get('/:inningsId/wagon-wheel', requireIntParam('inningsId'), getWagonWheel)
inningsScoringRoutes.post('/:inningsId/deliveries', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), recordDelivery)
inningsScoringRoutes.post('/:inningsId/events', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), recordEvent)

// Phase 4 — historical score correction
inningsScoringRoutes.post('/:inningsId/corrections/preview', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), previewCorrection)
inningsScoringRoutes.post('/:inningsId/corrections', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), applyCorrection)
inningsScoringRoutes.get('/:inningsId/corrections', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), listCorrections)
inningsScoringRoutes.post('/:inningsId/corrections/:correctionId/undo', requireIntParam('inningsId'), requireAuth, requireMatchScorerByInnings('inningsId'), undoCorrection)
