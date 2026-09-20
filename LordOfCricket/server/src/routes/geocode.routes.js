import { Router } from 'express'
import { searchLandmark } from '../controllers/geocode.controller.js'

const router = Router()

// Public, no auth — landmark search has to work for a logged-out visitor
// browsing the Grounds page.
router.get('/', searchLandmark)

export default router
