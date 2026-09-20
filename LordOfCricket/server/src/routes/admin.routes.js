import { Router } from 'express'
import { getDashboardStats } from '../controllers/adminDashboard.controller.js'
import { listAllGrounds, suspend, reactivate } from '../controllers/adminGrounds.controller.js'
import { listGroundOwners, getGroundOwnerGrounds, listPlayers, listUmpires, resetUserPassword } from '../controllers/adminUsers.controller.js'
import { listAuditLog } from '../controllers/auditLog.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'
import { adminPasswordResetLimiter } from '../middlewares/rateLimit.js'

// Mounted at /api/admin. SUPER_ADMIN Identity & Secure Provisioning
// feature — the Admin Control Center's own API surface. Every route here
// is a genuinely new admin-facing capability (see the architecture survey
// this feature started from: no dashboard-stats/all-grounds/ground-owners/
// players/umpires/audit-log endpoint existed anywhere before this).
//
// Dashboard stats are shared with plain 'admin' (matches AdminSidebar's
// existing Dashboard allow-list); every other route here is super_admin-
// only, matching how every OTHER super_admin-specific admin surface in
// this codebase (Ground Registrations, Photos Hub, Create Staff) is
// already exclusively super_admin, not shared with 'admin'.
const router = Router()

router.get('/dashboard/stats', requireAuth, requireStaffRole('super_admin', 'admin'), getDashboardStats)

router.get('/grounds', requireAuth, requireStaffRole('super_admin'), listAllGrounds)
router.post('/grounds/:publicGroundId/suspend', requireAuth, requireStaffRole('super_admin'), suspend)
router.post('/grounds/:publicGroundId/reactivate', requireAuth, requireStaffRole('super_admin'), reactivate)

router.get('/ground-owners', requireAuth, requireStaffRole('super_admin'), listGroundOwners)
router.get('/ground-owners/:userId/grounds', requireAuth, requireStaffRole('super_admin'), getGroundOwnerGrounds)

router.get('/players', requireAuth, requireStaffRole('super_admin'), listPlayers)
router.get('/umpires', requireAuth, requireStaffRole('super_admin'), listUmpires)

// Admin-initiated password recovery (§13) — step-up-gated inside
// generateTemporaryCredential itself (ADMIN_PASSWORD_RESET scope), same
// "consume the grant inside the mutation's own transaction" pattern as
// every other step-up-gated action in this codebase.
router.post('/users/:userId/reset-password', requireAuth, requireStaffRole('super_admin'), adminPasswordResetLimiter, resetUserPassword)

router.get('/audit-log', requireAuth, requireStaffRole('super_admin'), listAuditLog)

export default router
