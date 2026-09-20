import express from 'express'
import multer from 'multer'
import { listImages, getImage, uploadImage, updateImage, deleteImage } from '../controllers/galleryImage.controller.js'
import { requireAuth,  requireStaffRole } from '../middlewares/auth.js'

// Memory storage, not disk — the buffer goes straight to Cloudinary
// (uploadImageFileDetailed) and is never written to this server's
// filesystem, which on most hosts is ephemeral. Same pattern as
// canteenMenu.routes.js's own inline multer instance.
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

// Normalizes both multer's own errors (oversized file, LIMIT_FILE_SIZE) and
// fileFilter rejections into the { statusCode, message } shape
// middlewares/errorHandler.js already knows how to render, instead of
// letting an unrecognized error fall through to a generic 500.
function uploadSingleImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next()
    err.statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 10MB or smaller.'
    next(err)
  })
}

const router = express.Router()

// Phase 12 — DEPRECATED DEVELOPMENT ROUTES for the single-ground phase.
// Gallery images are ground-specific resources managed by Ground Owners and Staff.
// Super Admin no longer has operational CRUD access to gallery images.
// These routes should not be called from production frontend (see AppRoutes.jsx).
//
// When multiple grounds are deployed, these routes will need multi-ground
// alternatives like: /grounds/:publicGroundId/gallery
router.get('/', listImages)
router.get('/:id', getImage)
router.post('/', requireAuth, requireStaffRole('admin'), uploadSingleImage, uploadImage)
router.patch('/:id', requireAuth, requireStaffRole('admin'), updateImage)
router.delete('/:id', requireAuth, requireStaffRole('admin'), deleteImage)

export default router
