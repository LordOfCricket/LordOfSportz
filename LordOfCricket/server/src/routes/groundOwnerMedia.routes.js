import express from 'express'
import multer from 'multer'
import {
  listGroundMedia,
  addGroundMediaByUrl,
  uploadGroundMedia,
  deleteGroundMedia,
  setHeroPhoto,
  reorderPhotos,
} from '../controllers/groundOwnerMedia.controller.js'
import { requireAuth } from '../middlewares/auth.js'
import { requireGroundRole } from '../middlewares/groundAccess.js'

// Memory storage (straight to Cloudinary), matching existing pattern
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const MAX_FILE_BYTES = 10 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WEBP images are allowed.'))
    }
    cb(null, true)
  },
})

function uploadSingleImage(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next()
    err.statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 10MB or smaller.'
    next(err)
  })
}

const router = express.Router({ mergeParams: true })

// Phase 2 — Ground Owner media management
// All routes: /ground-owner/grounds/:publicGroundId/media/...
// Authorization: requireAuth + requireGroundRole('GROUND_OWNER')

router.get('/', requireAuth, requireGroundRole('GROUND_OWNER'), listGroundMedia)
router.post('/', requireAuth, requireGroundRole('GROUND_OWNER'), addGroundMediaByUrl)
router.post('/upload', requireAuth, requireGroundRole('GROUND_OWNER'), uploadSingleImage, uploadGroundMedia)
router.delete('/:id', requireAuth, requireGroundRole('GROUND_OWNER'), deleteGroundMedia)
router.patch('/:id/hero', requireAuth, requireGroundRole('GROUND_OWNER'), setHeroPhoto)
router.patch('/reorder', requireAuth, requireGroundRole('GROUND_OWNER'), reorderPhotos)

export default router
