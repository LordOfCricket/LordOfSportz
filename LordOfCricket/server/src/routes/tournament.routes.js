import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  createTournamentHandler,
  listTournamentsHandler,
  getTournamentHandler,
  openRegistrationHandler,
  registerTeamHandler,
  removeTeamHandler,
  listTeamsHandler,
  addSquadPlayerHandler,
  removeSquadPlayerHandler,
  listSquadHandler,
  generateFixturesHandler,
  listFixturesHandler,
  scheduleFixtureHandler,
  resolveFixtureHandler,
  completeLeagueHandler,
  getStandingsHandler,
  getStatisticsHandler,
} from '../controllers/tournament.controller.js'

const router = Router()

// Public reads (Part 39/40/61 — no auth wall on tournament viewing).
router.get('/', listTournamentsHandler)
router.get('/:publicTournamentId', getTournamentHandler)
router.get('/:publicTournamentId/teams', listTeamsHandler)
router.get('/:publicTournamentId/squad', listSquadHandler)
router.get('/:publicTournamentId/fixtures', listFixturesHandler)
router.get('/:publicTournamentId/standings', getStandingsHandler)
router.get('/:publicTournamentId/statistics', getStatisticsHandler)

// Organizer-only writes (Part 6/61 — staff, server-authorized every time).
router.post('/', requireAuth, requireRole('staff'), createTournamentHandler)
router.post('/:publicTournamentId/open-registration', requireAuth, requireRole('staff'), openRegistrationHandler)
router.post('/:publicTournamentId/teams', requireAuth, requireRole('staff'), registerTeamHandler)
router.delete('/:publicTournamentId/teams/:teamId', requireAuth, requireRole('staff'), removeTeamHandler)
router.post('/:publicTournamentId/squad', requireAuth, requireRole('staff'), addSquadPlayerHandler)
router.delete('/:publicTournamentId/squad/:teamId/:playerId', requireAuth, requireRole('staff'), removeSquadPlayerHandler)
router.post('/:publicTournamentId/fixtures/generate', requireAuth, requireRole('staff'), generateFixturesHandler)
router.patch('/:publicTournamentId/fixtures/:fixtureId/schedule', requireAuth, requireRole('staff'), scheduleFixtureHandler)
router.post('/:publicTournamentId/fixtures/:fixtureId/resolve', requireAuth, requireRole('staff'), resolveFixtureHandler)
router.post('/:publicTournamentId/complete', requireAuth, requireRole('staff'), completeLeagueHandler)

export default router
