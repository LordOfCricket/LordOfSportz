import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundRole, requireGroundPermission } from '../middlewares/groundAccess.js'
import {
  listMyGrounds,
  updateGroundProfile,
  listGroundMatches,
  createGroundMatch,
  getGroundMatchUmpireSlots,
  startGroundMatch,
  completeGroundMatch,
  cancelGroundMatch,
  markUmpireNoShow,
  getEligibleReplacements,
  assignReplacementUmpire,
  getMatchAssignmentHistory,
  getMatchIncidents,
  setGroundMatchUmpireFee,
  updateGroundMatchSlotPaymentStatus,
  getRecommendedUmpires,
  getUmpireOperationsSummary,
  createGroundStaff,
  listGroundStaff,
  getPermissionCatalog,
  grantStaffPermissionHandler,
  revokeStaffPermissionHandler,
  disableStaffMembershipHandler,
  getGroundDashboard,
  getGroundAnalytics,
  exportGroundAnalyticsCsv,
  getGroundTrends,
  getGroundReviews,
  getGroundNotifications,
  markGroundNotificationRead,
  markAllGroundNotificationsRead,
} from '../controllers/groundOwner.controller.js'
import { proposeUmpireForSlot, listMatchProposals, cancelMatchProposal } from '../controllers/umpireProposal.controller.js'
import { listGroundPricingSlots, createGroundPricingSlot, updateGroundPricingSlot, deleteGroundPricingSlot } from '../controllers/groundPricing.controller.js'

// Mounted at /api/ground-owner. Phase 5 — most routes below were
// requireGroundRole('GROUND_OWNER') only; they now use
// requireGroundPermission(key) instead, which still gives the Owner full
// implicit access to their own ground (unchanged behavior for every existing
// Owner caller) but ALSO admits a GROUND_ADMIN/CANTEEN_STAFF membership that
// holds an explicit, Owner-granted permission for that ground — see
// docs/AUTHORIZATION.md for the full catalog/reasoning. Staff creation and
// every permission grant/revoke/disable endpoint stay hardcoded
// requireGroundRole('GROUND_OWNER') — never delegable, closing the "staff
// modifies another staff's permissions" escalation path at the routing
// level, not with a runtime check.
const router = Router()
router.get('/grounds', requireAuth, listMyGrounds)
router.patch('/grounds/:publicGroundId', requireAuth, requireGroundRole('GROUND_OWNER'), updateGroundProfile)
router.get('/grounds/:publicGroundId/dashboard', requireAuth, requireGroundRole('GROUND_OWNER'), getGroundDashboard)
// Phase 11 audit — Phase 10's analytics service existed but had no route
// (an unreachable "broken flow" caught by the Phase 11 audit).
router.get('/grounds/:publicGroundId/analytics', requireAuth, requireGroundRole('GROUND_OWNER'), getGroundAnalytics)
// Phase 14 — CSV export. Owner-only (financially sensitive — revenue),
// same requireGroundRole('GROUND_OWNER') as every Owner-only route above,
// never delegated to staff permissions.
router.get('/grounds/:publicGroundId/analytics/export', requireAuth, requireGroundRole('GROUND_OWNER'), exportGroundAnalyticsCsv)
// Phase 16 — day-by-day trend series.
router.get('/grounds/:publicGroundId/analytics/trends', requireAuth, requireGroundRole('GROUND_OWNER'), getGroundTrends)
// Phase 13 — Ground Owner Reviews. Owner-only (requireGroundRole), same
// posture as Dashboard/Analytics above — not delegated to staff.
router.get('/grounds/:publicGroundId/reviews', requireAuth, requireGroundRole('GROUND_OWNER'), getGroundReviews)
// Phase 15 — Ground Owner Notifications. Owner-only (requireGroundRole),
// same posture as Reviews/Dashboard/Analytics above.
router.get('/grounds/:publicGroundId/notifications', requireAuth, requireGroundRole('GROUND_OWNER'), getGroundNotifications)
router.post('/grounds/:publicGroundId/notifications/:id/read', requireAuth, requireGroundRole('GROUND_OWNER'), markGroundNotificationRead)
router.post('/grounds/:publicGroundId/notifications/read-all', requireAuth, requireGroundRole('GROUND_OWNER'), markAllGroundNotificationsRead)
router.get('/grounds/:publicGroundId/matches', requireAuth, requireGroundPermission('MATCH_VIEW'), listGroundMatches)
router.post('/grounds/:publicGroundId/matches', requireAuth, requireGroundPermission('MATCH_MANAGE'), createGroundMatch)
router.get('/grounds/:publicGroundId/matches/:matchId/umpire-slots', requireAuth, requireGroundPermission('MATCH_VIEW'), getGroundMatchUmpireSlots)
router.post('/grounds/:publicGroundId/matches/:matchId/start', requireAuth, requireGroundPermission('MATCH_MANAGE'), startGroundMatch)
router.post('/grounds/:publicGroundId/matches/:matchId/complete', requireAuth, requireGroundPermission('MATCH_MANAGE'), completeGroundMatch)
// Phase 6 (Umpire Module) — pre-match cancellation, same permission as
// start/complete above. Not delegable to an umpire merely by officiating —
// this is exclusively a ground-management action.
router.post('/grounds/:publicGroundId/matches/:matchId/cancel', requireAuth, requireGroundPermission('MATCH_MANAGE'), cancelGroundMatch)

// Phase 23 — no-show / replacement / assignment history (Workstreams F/G/H).
router.post(
  '/grounds/:publicGroundId/matches/:matchId/umpire-slots/:slotId/no-show',
  requireAuth,
  requireGroundPermission('UMPIRE_MANAGE'),
  markUmpireNoShow,
)
router.get(
  '/grounds/:publicGroundId/matches/:matchId/umpire-slots/:slotId/eligible-replacements',
  requireAuth,
  requireGroundPermission('UMPIRE_MANAGE'),
  getEligibleReplacements,
)
router.post(
  '/grounds/:publicGroundId/matches/:matchId/umpire-slots/:slotId/replace',
  requireAuth,
  requireGroundPermission('UMPIRE_MANAGE'),
  assignReplacementUmpire,
)
router.get('/grounds/:publicGroundId/matches/:matchId/umpire-history', requireAuth, requireGroundPermission('MATCH_VIEW'), getMatchAssignmentHistory)
// Umpire Intelligence & Scale 2.0, Workstream C — deterministic, explainable
// recommendations. Informational only; assignment still goes through the
// existing apply/replace flows above.
router.get('/grounds/:publicGroundId/matches/:matchId/recommended-umpires', requireAuth, requireGroundPermission('MATCH_VIEW'), getRecommendedUmpires)
// Workstream J — ground-level umpire operations summary for the current month.
router.get('/grounds/:publicGroundId/umpire-operations-summary', requireAuth, requireGroundPermission('MATCH_VIEW'), getUmpireOperationsSummary)
router.get('/grounds/:publicGroundId/matches/:matchId/incidents', requireAuth, requireGroundPermission('MATCH_VIEW'), getMatchIncidents)

// Umpire Communication & Commercial 2.0 — fee + payment status.
router.patch('/grounds/:publicGroundId/matches/:matchId/umpire-fee', requireAuth, requireGroundPermission('MATCH_MANAGE'), setGroundMatchUmpireFee)
router.patch(
  '/grounds/:publicGroundId/matches/:matchId/umpire-slots/:slotId/payment-status',
  requireAuth,
  requireGroundPermission('MATCH_MANAGE'),
  updateGroundMatchSlotPaymentStatus,
)

// Umpire Proposals — Ground-Owner-initiated invitations to a specific
// approved umpire for a specific open slot, optionally with a private bonus.
router.post(
  '/grounds/:publicGroundId/matches/:matchId/umpire-slots/:slotId/propose',
  requireAuth,
  requireGroundPermission('UMPIRE_MANAGE'),
  proposeUmpireForSlot,
)
router.get('/grounds/:publicGroundId/matches/:matchId/proposals', requireAuth, requireGroundPermission('MATCH_VIEW'), listMatchProposals)
router.post(
  '/grounds/:publicGroundId/matches/:matchId/proposals/:proposalId/cancel',
  requireAuth,
  requireGroundPermission('UMPIRE_MANAGE'),
  cancelMatchProposal,
)

// Ground Time-Slot Pricing — delegable to staff via PRICING_VIEW/
// PRICING_MANAGE, same pattern as BOOKING_VIEW/BOOKING_MANAGE above; the
// Owner always has full implicit access via requireGroundPermission's own
// GROUND_OWNER bypass.
router.get('/grounds/:publicGroundId/pricing-slots', requireAuth, requireGroundPermission('PRICING_VIEW'), listGroundPricingSlots)
router.post('/grounds/:publicGroundId/pricing-slots', requireAuth, requireGroundPermission('PRICING_MANAGE'), createGroundPricingSlot)
router.patch('/grounds/:publicGroundId/pricing-slots/:slotId', requireAuth, requireGroundPermission('PRICING_MANAGE'), updateGroundPricingSlot)
router.delete('/grounds/:publicGroundId/pricing-slots/:slotId', requireAuth, requireGroundPermission('PRICING_MANAGE'), deleteGroundPricingSlot)

// Phase 5 — the static permission catalog. Ground-agnostic (the same 4
// permissions exist for every ground) and not sensitive, so requireAuth
// alone is enough — any authenticated user can see WHAT permissions exist,
// same as they could read this file's source. It's never scoped to a
// particular ground and grants nothing by itself.
router.get('/permissions/catalog', requireAuth, getPermissionCatalog)

// Phase 4 — ground-scoped Staff (GROUND_ADMIN/CANTEEN_STAFF). Listing uses
// the new granular STAFF_VIEW permission (delegable); creation and every
// permission/disable action below stay Owner-only (requireGroundRole),
// never delegable — see the file header comment.
router.get('/grounds/:publicGroundId/staff', requireAuth, requireGroundPermission('STAFF_VIEW'), listGroundStaff)
router.post('/grounds/:publicGroundId/staff', requireAuth, requireGroundRole('GROUND_OWNER'), createGroundStaff)

// Phase 5 — Staff permission management + disable. Owner-only: staff can
// never reach these regardless of any permission they hold, which is what
// makes "staff modifies own/another staff's permissions" structurally
// impossible rather than merely runtime-checked.
router.post('/grounds/:publicGroundId/staff/:membershipId/permissions', requireAuth, requireGroundRole('GROUND_OWNER'), grantStaffPermissionHandler)
router.delete(
  '/grounds/:publicGroundId/staff/:membershipId/permissions/:permissionKey',
  requireAuth,
  requireGroundRole('GROUND_OWNER'),
  revokeStaffPermissionHandler,
)
router.patch('/grounds/:publicGroundId/staff/:membershipId/disable', requireAuth, requireGroundRole('GROUND_OWNER'), disableStaffMembershipHandler)

export default router
