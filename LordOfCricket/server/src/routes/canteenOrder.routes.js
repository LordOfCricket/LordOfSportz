import express from 'express'
import {
  createOrder,
  getActiveOrder,
  getOrder,
  getOrderHistory,
  listOrders,
  lookupOrderByUser,
  updateOrderStatus,
} from '../controllers/canteenOrder.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { attachCurrentCanteen, requireCanteenStaffAccess, attachGroundCanteenContext, requireGroundCanteenRole } from '../middlewares/groundAccess.js'

// Phase 11 — ONE route table, reused for both URL schemes (Step 2/13). See
// canteenMenu.routes.js's identical comment.
function buildCanteenOrderRouter({ attachContext, staffAccess }) {
  const router = express.Router({ mergeParams: true })

  // Order administration previously accepted ANY staff account
  // (requireRole('staff') — including canteen_staff, unlike menu
  // management). Preserved exactly via legacyStaffRoles: 'any'.
  const orderStaffAccess = staffAccess({ legacyStaffRoles: 'any', groundRoles: ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF'] })

  router.get('/', requireAuth, orderStaffAccess, listOrders)
  router.get('/lookup', requireAuth, orderStaffAccess, lookupOrderByUser)
  // Self-service reads: any authenticated user, scoped to their own userId
  // (enforced in the controller, unchanged) — still needs to know WHICH
  // canteen via attachContext (never client-supplied).
  router.get('/active/:userId', requireAuth, attachContext, getActiveOrder)
  router.get('/history/:userId', requireAuth, attachContext, getOrderHistory)
  router.post('/', requireAuth, attachContext, createOrder)
  // CUSTOMER_CANTEEN_MIGRATION — this was orderStaffAccess-only (staff-only),
  // meaning the order's OWNING CUSTOMER could never fetch their own order by
  // id — a real, pre-existing gap discovered while migrating the customer
  // order-status/history-detail pages onto this exact endpoint (neither the
  // old nor the new route ever allowed it; no real staff UI calls this
  // specific endpoint today — staff dashboards render order details from
  // the list response instead, confirmed by inspection). Now matches
  // getActiveOrder/getOrderHistory's own established self-or-staff pattern:
  // attachContext resolves the canteen with no role gate, and the
  // controller itself enforces "staff, or this order's own customer."
  router.get('/:id', requireAuth, attachContext, getOrder)
  router.patch('/:id/status', requireAuth, orderStaffAccess, updateOrderStatus)
  return router
}

// TRANSITIONAL — /api/canteen/orders (Phase 10), unchanged for the existing frontend.
const transitionalRouter = buildCanteenOrderRouter({
  attachContext: attachCurrentCanteen,
  staffAccess: requireCanteenStaffAccess,
})

// REAL multi-ground router — /grounds/:publicGroundId/canteens/:publicCanteenId/orders (Phase 11).
export const groundScopedRouter = buildCanteenOrderRouter({
  attachContext: attachGroundCanteenContext,
  staffAccess: requireGroundCanteenRole,
})

export default transitionalRouter
