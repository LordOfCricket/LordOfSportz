import { Router } from 'express'
import {
  listAdvertisements,
  addAdvertisement,
  removeAdvertisement,
} from '../controllers/advertisement.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

const router = Router()

// Pre-Phase-11 cleanup security fix: these writes had no auth at all — any
// unauthenticated caller could add/remove homepage advertisements directly
// via the API regardless of the (also-unguarded) /admin/* client route.
router.get('/', listAdvertisements)
router.post('/', requireAuth, requireStaffRole('super_admin'), addAdvertisement)
router.delete('/:id', requireAuth, requireStaffRole('super_admin'), removeAdvertisement)

export default router
