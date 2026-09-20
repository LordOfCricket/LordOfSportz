import express from 'express'
import {
  listGroundAmenities,
  addGroundAmenity,
  removeGroundAmenity,
} from '../controllers/groundOwnerAmenities.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundRole } from '../middlewares/groundAccess.js'

const router = express.Router({ mergeParams: true })

// Phase 3 — Ground Owner amenity management
// All routes: /ground-owner/grounds/:publicGroundId/amenities/...
// Authorization: requireAuth + requireGroundRole('GROUND_OWNER')

router.get('/', requireAuth, requireGroundRole('GROUND_OWNER'), listGroundAmenities)
router.post('/', requireAuth, requireGroundRole('GROUND_OWNER'), addGroundAmenity)
router.delete('/:amenityKey', requireAuth, requireGroundRole('GROUND_OWNER'), removeGroundAmenity)

export default router
