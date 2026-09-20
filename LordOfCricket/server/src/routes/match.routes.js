import { Router } from 'express'
import { getPublicMatches, getHomeDiscovery, listMatches, getMatch, createMatchHandler, setToss, checkIn, reportIncident, listIncidents, getMatchChecklist, updateMatchChecklistItem, startMatch, finalizeMatch, getMatchSummary, getLiveMatchState, getMatchCommentary } from '../controllers/match.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'
import { requireMatchScorerByParam } from '../middlewares/matchScorerAccess.js'
import { commentaryLimiter } from '../middlewares/rateLimit.js'
import { requireIntParam } from '../middlewares/validateParams.js'

const router = Router()

// Phase 10 Part 1 — public match discovery. Registered before '/:id' so
// 'discover'/'home' are never swallowed as a match id.
router.get('/discover', getPublicMatches)
router.get('/home', getHomeDiscovery)
router.get('/', listMatches)
// U5.1 — match CREATION is no longer the same permission as match SCORING.
// Until U5.1, this was requireScorer (super_admin OR any approved umpire),
// which let an approved umpire create arbitrary matches merely by being
// approved — inconsistent with the product model U5 established (Ground
// Owner creates matches for their own ground; an umpire discovers/applies/
// officiates, never creates). Legacy/global creation with no ground context
// is now super_admin-only, reusing requireStaffRole exactly as every other
// super_admin-only route in this codebase already does — no new middleware.
// The Ground Owner path (groundOwner.routes.js, U5) is the intended way to
// create a match with a real ground_id; this route still exists for
// backward compatibility (tournament fixture generation and any
// ground-less/legacy match still need somewhere to be created) and for old
// matches with ground_id=NULL, which U1 always allowed and never backfilled.
router.post('/', requireAuth, requireStaffRole('super_admin'), createMatchHandler)
router.get('/:id', requireIntParam('id'), getMatch)
router.get('/:id/summary', requireIntParam('id'), getMatchSummary)
router.get('/:id/live-state', requireIntParam('id'), getLiveMatchState)
router.get('/:id/commentary', requireIntParam('id'), commentaryLimiter, getMatchCommentary)
router.patch('/:id/toss', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), setToss)
// Phase 23, Workstream E — same gate as toss/start: only the umpire
// actively assigned to THIS match may check in for it.
router.post('/:id/checkin', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), checkIn)
// Phase 23, Workstream I — incidents. GET allowed through 'completed' too
// (same allowedStatuses widening finalize uses) so the assigned umpire can
// still review what they reported after the match ends, not just while live.
router.post('/:id/incidents', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), reportIncident)
router.get(
  '/:id/incidents',
  requireIntParam('id'),
  requireAuth,
  requireMatchScorerByParam('id', { allowedStatuses: ['upcoming', 'live', 'completed', 'finalized'] }),
  listIncidents,
)
// Phase 23, Workstream C — pre-match checklist. Same gate as toss/checkin:
// only the actively-assigned umpire may read or update their own checklist.
router.get('/:id/checklist', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), getMatchChecklist)
router.patch('/:id/checklist', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), updateMatchChecklistItem)
router.post('/:id/start', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id'), startMatch)
// U3.1: the one deliberate exception to the default upcoming/live-only
// window — finalize's own precondition (match.service.js) is
// status==='completed', and the real production frontend (MatchRosterPage's
// "Review / Finalize") expects the assigned umpire to do this themselves.
// Blocking it here would make finalize unreachable for any umpire, not just
// restrict it, since 'completed' is the ONLY status finalize ever runs in.
router.post('/:id/finalize', requireIntParam('id'), requireAuth, requireMatchScorerByParam('id', { allowedStatuses: ['upcoming', 'live', 'completed'] }), finalizeMatch)

export default router
