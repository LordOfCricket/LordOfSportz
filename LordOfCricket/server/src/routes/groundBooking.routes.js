import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth.js'
import { bookingWriteLimiter } from '../middlewares/rateLimit.js'
import {
  getAvailability,
  createBooking,
  listMyBookings,
  cancelBooking,
  getStaffSchedule,
  createStaffBlock,
  removeStaffBlock,
  getBookingHistory,
} from '../controllers/groundBooking.controller.js'

const router = Router()

// Phase 14 Part 3 (17) — auth model chosen: public availability (no login
// needed to check the calendar), login required to actually confirm a
// booking. No guest-booking path — keeps this consistent with canteen
// ordering, the only other "create something as this account" flow in the app.
router.get('/availability', getAvailability)
router.post('/', bookingWriteLimiter, requireAuth, createBooking)
router.get('/my', requireAuth, listMyBookings)
router.post('/:publicBookingId/cancel', bookingWriteLimiter, requireAuth, cancelBooking)

// Staff-only operational management. Registered before the public routes
// above only matters for path-shape collisions — none exist here since
// these are all under /staff, so ordering is not load-bearing, but kept
// grouped for readability.
router.get('/staff/schedule', requireAuth, requireRole('staff'), getStaffSchedule)
router.post('/staff/block', bookingWriteLimiter, requireAuth, requireRole('staff'), createStaffBlock)
router.delete('/staff/block/:publicBookingId', requireAuth, requireRole('staff'), removeStaffBlock)

// Phase 18 Feature 10 — booking history (search/filter/sort/pagination), staff-only.
router.get('/history', requireAuth, requireRole('staff'), getBookingHistory)

export default router
