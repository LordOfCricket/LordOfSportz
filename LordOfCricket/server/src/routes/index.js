import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { listTeamBookings } from '../controllers/teamBooking.controller.js'
import healthRoutes from './health.routes.js'
import groundPhotoRoutes from './groundPhoto.routes.js'
import galleryImageRoutes from './galleryImage.routes.js'
import amenityRoutes from './amenity.routes.js'
import advertisementRoutes from './advertisement.routes.js'
import matchRoutes from './match.routes.js'
import indiaMatchRoutes from './indiaMatch.routes.js'
import partnerRoutes from './partner.routes.js'
import merchandiseRoutes from './merchandise.routes.js'
import groundRoutes from './ground.routes.js'
import groundOwnerRequestRoutes from './groundOwnerRequest.routes.js'
import geocodeRoutes from './geocode.routes.js'
import canteenMenuRoutes, { groundScopedRouter as groundScopedCanteenMenuRoutes } from './canteenMenu.routes.js'
import canteenOrderRoutes, { groundScopedRouter as groundScopedCanteenOrderRoutes } from './canteenOrder.routes.js'
import canteenStatusRoutes from './canteenStatus.routes.js'
import authRoutes from './auth.routes.js'
import mfaRoutes from './mfa.routes.js'
import umpireRequestRoutes from './umpireRequest.routes.js'
import staffRoutes from './staff.routes.js'
import meRoutes from './me.routes.js'
import meGroundStaffRoutes from './meGroundStaff.routes.js'
import teamRoutes from './team.routes.js'
import { matchScoringRoutes, inningsScoringRoutes } from './scoring.routes.js'
import { playerStatsRoutes, meStatsRoutes, leaderboardRoutes } from './statistics.routes.js'
import { playerFollowRoutes, teamFollowRoutes, groundFollowRoutes, meFollowingRoutes } from './follow.routes.js'
import groundBookingRoutes from './groundBooking.routes.js'
import teamBookingRoutes from './teamBooking.routes.js'
import matchProposalRoutes from './matchProposal.routes.js'
import groundOpsRoutes from './groundOps.routes.js'
import matchAvailabilityRoutes, { meAvailabilityRoutes } from './matchAvailability.routes.js'
import umpireAssignmentRoutes from './umpireAssignment.routes.js'
import matchMessageRoutes from './matchMessage.routes.js'
import { topUmpiresRoutes } from './umpireLeaderboard.routes.js'
import umpireSelfRoutes from './umpireSelf.routes.js'
import groundOwnerRoutes from './groundOwner.routes.js'
import groundOwnerMediaRoutes from './groundOwnerMedia.routes.js'
import groundOwnerAmenitiesRoutes from './groundOwnerAmenities.routes.js'
import groundOwnerBookingRoutes from './groundOwnerBooking.routes.js'
import matchFeedbackRoutes from './matchFeedback.routes.js'
import tournamentRoutes from './tournament.routes.js'
import { matchAIInsightRoutes, playerAIInsightRoutes, teamAIInsightRoutes } from './aiInsight.routes.js'
import { playerAnalyticsRoutes, teamAnalyticsRoutes, matchAnalyticsRoutes, tournamentAnalyticsRoutes } from './analytics.routes.js'
import adminRoutes from './admin.routes.js'
import adminAmenityCatalogRoutes from './adminAmenityCatalog.routes.js'
import auctionRoutes, { groundAuctionRouter } from './auction.routes.js'

const router = Router()

router.use('/health', healthRoutes)
router.use('/ground-photos', groundPhotoRoutes)
router.use('/gallery', galleryImageRoutes)
router.use('/amenities', amenityRoutes)
router.use('/advertisements', advertisementRoutes)
router.use('/matches', matchRoutes)
router.use('/matches', matchScoringRoutes)
router.use('/innings', inningsScoringRoutes)
router.use('/india-match', indiaMatchRoutes)
router.use('/partners', partnerRoutes)
router.use('/merchandise', merchandiseRoutes)

// Phase 17 — MUST be mounted before teamRoutes: playerAnalyticsRoutes/
// teamAnalyticsRoutes register a bare `/compare` route, which would otherwise
// be silently swallowed by teamRoutes' `/:id` (Express matches mounted
// routers in `.use()` registration order, and `/:id` matches the literal
// segment "compare" just like any other id).
router.use('/players', playerAnalyticsRoutes)
router.use('/teams', teamAnalyticsRoutes)

router.use('/teams', teamRoutes)

// Phase 14 Part 1 — player match availability/RSVP.
router.use('/matches', matchAvailabilityRoutes)
router.use('/me', meAvailabilityRoutes)

// Phase 21 (U3) — umpire match-slot application/assignment.
router.use('/matches', umpireAssignmentRoutes)
// Umpire Communication & Commercial 2.0 — match-scoped messages.
router.use('/matches', matchMessageRoutes)
// Phase 21 (U4) — the umpire's own dashboard reads (available matches, my
// assignments, my profile).
router.use('/umpire', umpireSelfRoutes)
// Phase 21 (U5) — Ground Owner match management (own grounds, own matches,
// creating a match scoped to an owned ground).
// Phase 2 — Ground Owner media management (upload, delete, reorder, set hero).
// Phase 3 — Ground Owner amenity management (select from catalog, remove).
// Phase 6 — Ground Owner booking management (availability, list, check-in, no-show).
router.use('/ground-owner', groundOwnerRoutes)
router.use('/ground-owner/grounds/:publicGroundId/media', groundOwnerMediaRoutes)
router.use('/ground-owner/grounds/:publicGroundId/amenities', groundOwnerAmenitiesRoutes)
router.use('/ground-owner/grounds/:publicGroundId/bookings', groundOwnerBookingRoutes)
// Phase 22 (U6) — post-match feedback (Ground/Umpire/App), eligibility
// computed per (match, user) inside the service.
router.use('/matches', matchFeedbackRoutes)

// Phase 14 Part 3 — ground booking.
router.use('/bookings', groundBookingRoutes)

// Phase 18 — ground operations (timeline, staff dashboard, reports,
// utilization, audit log, notifications).
router.use('/ground', groundOpsRoutes)

// Phase 15 — tournament management.
router.use('/tournaments', tournamentRoutes)

// Phase 16 — AI Match/Player/Team Insight (public reads, staff regenerate).
router.use('/matches', matchAIInsightRoutes)
router.use('/players', playerAIInsightRoutes)
router.use('/teams', teamAIInsightRoutes)

// Phase 17 — match/tournament analytics. Both only add a `/:id/analytics`
// sub-path (an extra segment), so — unlike the player/team `/compare` routes
// above — mount order relative to matchRoutes/tournamentRoutes doesn't matter.
router.use('/matches', matchAnalyticsRoutes)
router.use('/tournaments', tournamentAnalyticsRoutes)

// Phase 7 — official career statistics, derived from finalized match history only.
router.use('/players', playerStatsRoutes)
router.use('/me', meStatsRoutes)
router.use('/stats', leaderboardRoutes)

// Priority 1 — Follow Players / Teams. Each only adds a `/follow` sub-path
// (an extra segment), so mount order relative to the base resource routers
// doesn't matter — the same reasoning as match/tournament analytics above.
router.use('/players', playerFollowRoutes)
router.use('/teams', teamFollowRoutes)
// Priority 5 — Favorite Grounds. `/grounds/:publicGroundId/follow`; extra
// segment past the public ground profile route, so mount order is free.
router.use('/grounds', groundFollowRoutes)
router.use('/me', meFollowingRoutes)
// Umpire Intelligence & Scale 2.0 — deliberately a separate route, never
// merged into the player leaderboard's own :metric space.
router.use('/stats', topUmpiresRoutes)

// Site-wide auth (single login for players, staff, umpires)
router.use('/auth', authRoutes)
// Phase 6 — privileged-account MFA/WebAuthn/step-up, also under /auth.
router.use('/auth', mfaRoutes)
router.use('/umpire-requests', umpireRequestRoutes)
router.use('/staff', staffRoutes)
router.use('/me', meRoutes)
router.use('/me', meGroundStaffRoutes)
// SUPER_ADMIN Identity & Secure Provisioning feature — the Admin Control
// Center's own API surface (dashboard stats, all grounds, ground owners,
// players, umpires, admin-initiated password recovery, audit log).
router.use('/admin', adminRoutes)
// Amenities Master — Super Admin CRUD for the shared amenity_catalog table
// (previously seed-data-only; Ground Owner's own read-only access to this
// same table, GET /ground-owner-requests/amenity-catalog, is untouched).
router.use('/admin/amenity-catalog', adminAmenityCatalogRoutes)

// Canteen (merged into the main LOC API, namespaced under /canteen)
// TRANSITIONAL — Phase 10/11: single-canteen-resolving, kept for the
// existing frontend (Phase 11 Step 20/30 forbids a frontend redesign this
// phase). Fails safely (409) instead of guessing if a second canteen ever
// exists (see canteen.model.js's AmbiguousCanteenError).
router.use('/canteen/menu', canteenMenuRoutes)
router.use('/canteen/orders', canteenOrderRoutes)
router.get('/canteen/health', (req, res) => {
  res.json({ ok: true, service: 'Canteen Management API' })
})

// REAL multi-ground routes (Phase 11) — the canonical architecture going
// forward: tenancy is resolved from the URL + verified in PostgreSQL, never
// guessed. Not yet used by any frontend; exists so ground/canteen tenancy
// is provably real and testable ahead of the frontend's own migration.
router.use('/grounds/:publicGroundId/canteens/:publicCanteenId/menu', groundScopedCanteenMenuRoutes)
router.use('/grounds/:publicGroundId/canteens/:publicCanteenId/orders', groundScopedCanteenOrderRoutes)
// Phase 24 — Ground Owner self-service canteen activate/deactivate.
router.use('/grounds/:publicGroundId/canteens/:publicCanteenId/status', canteenStatusRoutes)

// Phase 24 — MATCH/PRACTICE team bookings, multi-ground/team/player
// conflict engine. Distinct from the legacy single-ground walk-in flow
// mounted at /bookings above.
router.use('/grounds/:publicGroundId/bookings', teamBookingRoutes)
router.get('/team-bookings/my', requireAuth, listTeamBookings)

// Phase 25 — team match proposals ("looking for an opponent").
router.use('/grounds/:publicGroundId/proposals', matchProposalRoutes)

// Phase 12 — public ground discovery (GET /grounds/nearby) and public
// ground profile (GET /grounds/:publicGroundId). Mounted at the same
// '/grounds' prefix as the mounts above with no ordering conflict: Express
// strips the '/grounds' prefix and hands the remainder to whichever router
// is tried; groundRoutes only defines single-segment routes ('/nearby',
// '/:publicGroundId'), so a multi-segment path like
// '/GRD-x/canteens/CAN-y/menu' never matches here and falls through to the
// canteen-scoped mounts above, regardless of registration order.
router.use('/grounds', groundRoutes)

// Phase 4 — Ground Owner request/approval (public submission + super_admin
// review queue). Replaces the old GET/PATCH /ground-review admin queue
// (retired) — see ground.controller.js#registerGround and
// groundOwnerRequest.service.js for why: reviewing/deciding now happens
// against a ground_owner_requests row (which never grants membership on its
// own), not a DRAFT grounds row (which used to grant it immediately on
// submission, before any review — the bug this phase fixes).
router.use('/ground-owner-requests', groundOwnerRequestRoutes)

// Grounds page — landmark search (free-text -> real lat/lng via OpenStreetMap
// Nominatim, no paid geocoding service). Its own top-level route, not under
// /grounds, since it geocodes an arbitrary place name, not a ground.
router.use('/geocode', geocodeRoutes)

// Auction — Phase A. Two mount points: the ground-scoped router creates/lists
// an auction for a ground the caller owns, the auction-scoped router acts on
// one existing auction (which resolves its own ground from the auction row).
router.use('/grounds/:publicGroundId/auctions', groundAuctionRouter)
router.use('/auctions', auctionRoutes)

export default router
