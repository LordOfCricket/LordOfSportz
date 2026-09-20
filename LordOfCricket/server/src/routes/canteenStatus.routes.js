import express from 'express'
import { updateCanteenStatus } from '../controllers/canteenStatus.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundCanteenRole } from '../middlewares/groundAccess.js'

// Mounted at /grounds/:publicGroundId/canteens/:publicCanteenId/status
// (mergeParams: true so publicGroundId/publicCanteenId from the parent
// mount reach requireGroundCanteenRole). Phase 24 — reuses the exact same
// tenancy-resolution + IDOR-protection middleware every other real
// multi-ground canteen route already uses (canteenMenu.routes.js/
// canteenOrder.routes.js's groundScopedRouter) — no parallel authorization
// system. Owner-only (groundRoles: ['GROUND_OWNER'], no legacyStaffRoles):
// activating/deactivating the canteen is a business-configuration action,
// same non-delegable posture as ground profile updates and staff/
// permission management, not a day-to-day staff task. MFA is enforced
// inside requireGroundCanteenRole itself for the GROUND_OWNER path (and for
// Super Admin's own bypass), unchanged from every other route using it.
const router = express.Router({ mergeParams: true })

router.patch('/', requireAuth, requireGroundCanteenRole({ groundRoles: ['GROUND_OWNER'] }), updateCanteenStatus)

export default router
