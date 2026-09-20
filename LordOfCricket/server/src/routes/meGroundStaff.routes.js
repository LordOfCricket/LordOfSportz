import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import { getMyGroundStaffMemberships } from '../controllers/groundStaffSelf.controller.js'

// Mounted at /api/me. Same posture as /ground-owner/grounds (RequireGroundOwner's
// own self-check): requireAuth only, empty array for anyone not ground staff —
// "am I staff anywhere" is answered by list length, never a 403.
const router = Router()

router.get('/ground-staff-memberships', requireAuth, getMyGroundStaffMemberships)

export default router
