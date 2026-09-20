import { Router } from 'express'
import { getFeaturedIndiaMatch } from '../controllers/indiaMatch.controller.js'

const router = Router()

router.get('/featured', getFeaturedIndiaMatch)

export default router
