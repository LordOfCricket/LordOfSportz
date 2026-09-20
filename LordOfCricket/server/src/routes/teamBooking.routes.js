import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { attachGroundContext, requireGroundPermission } from '../middlewares/groundAccess.js'
import { bookingWriteLimiter } from '../middlewares/rateLimit.js'
import {
  createTeamBooking,
  getTeamBooking,
  cancelTeamBooking,
  staffCancelTeamBooking,
  checkInTeamBooking,
  recordTeamBookingNoShow,
  listTeamBookings,
} from '../controllers/teamBooking.controller.js'

// Phase 24 — mounted at /grounds/:publicGroundId/bookings (index.js),
// alongside the same-shaped canteen ground-scoped routes (Phase 11). The
// legacy single-ground walk-in flow (/bookings, groundBooking.routes.js) is
// untouched and does not live under this prefix.

const router = Router({ mergeParams: true })

// Player-facing: any authenticated player, authorized per-action by
// bookingConflict.service.js (team membership / booking ownership) — not
// gated behind ground-staff membership, since a normal player is a
// customer of the ground, not staff at it.
router.post('/', bookingWriteLimiter, requireAuth, attachGroundContext, createTeamBooking)
router.get('/:publicBookingId', requireAuth, attachGroundContext, getTeamBooking)
router.post('/:publicBookingId/cancel', bookingWriteLimiter, requireAuth, attachGroundContext, cancelTeamBooking)

// Ground-staff-facing: requires BOOKING_MANAGE at this specific ground
// (GROUND_OWNER has implicit access, same as every other ground-scoped
// permission route — see requireGroundPermission).
router.post('/:publicBookingId/staff-cancel', bookingWriteLimiter, requireAuth, requireGroundPermission('BOOKING_MANAGE'), staffCancelTeamBooking)
router.post('/:publicBookingId/check-in', bookingWriteLimiter, requireAuth, requireGroundPermission('BOOKING_MANAGE'), checkInTeamBooking)
router.post('/:publicBookingId/no-show', bookingWriteLimiter, requireAuth, requireGroundPermission('BOOKING_MANAGE'), recordTeamBookingNoShow)

export default router
