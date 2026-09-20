import express from 'express'
import {
  listAllAmenities,
  createAmenityHandler,
  updateAmenityHandler,
  deleteAmenityHandler,
} from '../controllers/adminAmenityCatalog.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

// Amenities Master — Super Admin only, every route. This is the admin CRUD
// surface for amenity_catalog (previously seed-data-only, no admin UI at
// all). Ground Owner read access to the SAME table stays exactly as it was
// (GET /ground-owner-requests/amenity-catalog, unrelated/untouched).
const router = express.Router()

router.use(requireAuth, requireStaffRole('super_admin'))

router.get('/', listAllAmenities)
router.post('/', createAmenityHandler)
router.patch('/:key', updateAmenityHandler)
router.delete('/:key', deleteAmenityHandler)

export default router
