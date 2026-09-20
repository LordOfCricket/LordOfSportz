import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundRole, requireGroundPermission, attachGroundContext } from '../middlewares/groundAccess.js'
import { bookingWriteLimiter } from '../middlewares/rateLimit.js'
import {
  getGroundAvailability,
  listGroundBookings,
  getGroundBooking,
  updateGroundBookingStatus,
  createGroundStaffBlock,
  removeGroundStaffBlock,
} from '../controllers/groundOwnerBooking.controller.js'

const router = Router({ mergeParams: true })

// Phase 6 — Ground Owner booking management. All endpoints scoped to a specific
// ground, authorized via attachGroundContext + requireGroundRole/requireGroundPermission.

// Phase 6 — Ground owner viewing availability for their ground (requires auth).
// Distinct from public /bookings/availability which requires no auth.
router.get('/availability', requireAuth, attachGroundContext, getGroundAvailability)

// Ground Owner Staff Audit — reading own ground's bookings now also accepts
// BOOKING_VIEW (previously BOOKING_MANAGE-only, which left the "View
// Bookings" permission an Owner can grant in Staff Management doing nothing
// at these two routes — inconsistent with bookingConflict.service.js's own
// assertCanViewBooking, which already treats BOOKING_VIEW as sufficient to
// view a booking). Mutating the status below still requires BOOKING_MANAGE.
router.get('/', requireAuth, attachGroundContext, requireGroundPermission('BOOKING_VIEW', 'BOOKING_MANAGE'), listGroundBookings)
router.get('/:publicBookingId', requireAuth, attachGroundContext, requireGroundPermission('BOOKING_VIEW', 'BOOKING_MANAGE'), getGroundBooking)

// Ground owner operations — managing booking status (check-in, no-show, cancel)
router.patch('/:publicBookingId/status', bookingWriteLimiter, requireAuth, attachGroundContext, requireGroundPermission('BOOKING_MANAGE'), updateGroundBookingStatus)

// Staff block management (ground owner only — never delegable)
router.post('/staff-blocks', bookingWriteLimiter, requireAuth, attachGroundContext, requireGroundRole('GROUND_OWNER'), createGroundStaffBlock)
router.delete('/staff-blocks/:publicBlockId', bookingWriteLimiter, requireAuth, attachGroundContext, requireGroundRole('GROUND_OWNER'), removeGroundStaffBlock)

export default router
