import { Router } from 'express'
import { createStaff, listStaff } from '../controllers/staff.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

const router = Router()

router.get('/', requireAuth, requireStaffRole('super_admin'), listStaff)
router.post('/', requireAuth, requireStaffRole('super_admin'), createStaff)

export default router
