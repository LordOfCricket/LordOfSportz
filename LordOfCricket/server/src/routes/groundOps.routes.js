import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import {
  getTimeline,
  getDashboard,
  getReport,
  getUtilization,
  getAuditLog,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/groundOps.controller.js'

// Phase 18 — new ground-operations surface, mounted at /ground (a genuinely
// new capability set with no existing prefix to extend — /bookings stays
// booking-specific, matching Phase 14's own scope). The daily timeline is
// intentionally public (same posture as GET /bookings/availability — Feature
// 6/8 both want "no login required to see it"); every aggregate/report/audit/
// dashboard endpoint is staff-only, and notifications are scoped to the
// authenticated user's own inbox.

const router = Router()

router.get('/timeline', getTimeline)

router.get('/dashboard', requireAuth, requireRole('staff'), getDashboard)
router.get('/reports', requireAuth, requireRole('staff'), getReport)
router.get('/utilization', requireAuth, requireRole('staff'), getUtilization)
router.get('/audit-log', requireAuth, requireRole('staff'), getAuditLog)

router.get('/notifications', requireAuth, getMyNotifications)
router.post('/notifications/:id/read', requireAuth, markNotificationRead)
router.post('/notifications/read-all', requireAuth, markAllNotificationsRead)

export default router
