import { Router } from 'express'
import { listPending, getMine, decide } from '../controllers/umpireRequest.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

const router = Router()

router.get('/me', requireAuth, getMine)
router.get('/', requireAuth, requireStaffRole('super_admin'), listPending)
router.patch('/:id', requireAuth, requireStaffRole('super_admin'), decide)

export default router
