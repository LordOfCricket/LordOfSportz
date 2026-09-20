import { Router } from 'express'
import { requireAuth, requireApprovedUmpire } from '../middlewares/auth.js'
import { aiLimiter } from '../middlewares/rateLimit.js'
import {
  listAvailableMatches,
  listMyAssignments,
  getMyProfile,
  updateMyProfile,
  getMyAvailability,
  updateWeeklyAvailability,
  updateDateAvailability,
  deleteDateAvailabilityHandler,
  getMyEarnings,
  getMyOfficiatingTrend,
  getMyUmpireInsight,
  regenerateMyUmpireInsight,
} from '../controllers/umpireSelf.controller.js'
import { listNearbyGroundsForUmpire, listGroundsByCityForUmpire, listAllGroundsForUmpire } from '../controllers/umpireGroundDiscovery.controller.js'
import { listMyProposals, respondToMyProposal } from '../controllers/umpireProposal.controller.js'

// Mounted at /api/umpire. U4's 3 read endpoints U3 deliberately deferred
// (Phase 0's illustrative /api/umpire/matches/available, /api/umpire/
// assignments), plus a minimal profile write (the availability toggle).
// requireApprovedUmpire, not requireScorer — these are "my own umpire data"
// reads, not scoring-capability routes.
const router = Router()
router.get('/matches/available', requireAuth, requireApprovedUmpire, listAvailableMatches)
router.get('/assignments', requireAuth, requireApprovedUmpire, listMyAssignments)
router.get('/profile', requireAuth, requireApprovedUmpire, getMyProfile)
router.patch('/profile', requireAuth, requireApprovedUmpire, updateMyProfile)

// Availability calendar (Phase 23, Workstream A) — weekly recurring rules
// plus date-specific overrides, both consumed by applyForSlot's new
// eligibility gate. Same requireApprovedUmpire posture as /profile — an
// umpire manages only their own availability.
router.get('/availability', requireAuth, requireApprovedUmpire, getMyAvailability)
router.patch('/availability/weekly', requireAuth, requireApprovedUmpire, updateWeeklyAvailability)
router.patch('/availability/date', requireAuth, requireApprovedUmpire, updateDateAvailability)
router.delete('/availability/date/:date', requireAuth, requireApprovedUmpire, deleteDateAvailabilityHandler)

// Ground-wise discovery — one large ground card per nearby/city ground,
// each carrying its own upcoming matches + real umpire-slot status, so
// the frontend can show "Interested for Umpiring" per match without a
// second per-ground round trip.
router.get('/grounds/all', requireAuth, requireApprovedUmpire, listAllGroundsForUmpire)
router.get('/grounds/nearby', requireAuth, requireApprovedUmpire, listNearbyGroundsForUmpire)
router.get('/grounds/by-city', requireAuth, requireApprovedUmpire, listGroundsByCityForUmpire)

// Umpire Communication & Commercial 2.0 — "My Earnings". Same
// requireApprovedUmpire posture as every other umpire self-service route.
router.get('/earnings', requireAuth, requireApprovedUmpire, getMyEarnings)

// Umpire Intelligence & Scale 2.0 — monthly officiating/rating/reliability
// trend, own data only. Its own endpoint (see getMyOfficiatingTrend's own
// comment) rather than folded into /profile.
router.get('/statistics/trend', requireAuth, requireApprovedUmpire, getMyOfficiatingTrend)

// Umpire Intelligence & Scale 2.0, Workstreams L/M/N/W — self-scoped AI
// performance summary, reusing the existing AI infrastructure exactly
// (aiInsight.service.js#getUmpireInsight). Rate-limited like every other
// AI route in this codebase (aiLimiter) — AI calls cost real money/latency.
router.get('/ai-insight', requireAuth, requireApprovedUmpire, aiLimiter, getMyUmpireInsight)
router.post('/ai-insight/regenerate', requireAuth, requireApprovedUmpire, aiLimiter, regenerateMyUmpireInsight)

// Umpire Proposals — offers a Ground Owner has sent this umpire directly.
router.get('/proposals', requireAuth, requireApprovedUmpire, listMyProposals)
router.post('/proposals/:proposalId/respond', requireAuth, requireApprovedUmpire, respondToMyProposal)

export default router
