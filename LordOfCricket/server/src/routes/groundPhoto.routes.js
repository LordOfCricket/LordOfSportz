import express from 'express'
import multer from 'multer'
import {
  listGroundPhotos,
  addGroundPhoto,
  uploadGroundPhoto,
  removeGroundPhoto,
} from '../controllers/groundPhoto.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'
import { attachSingleGroundContext } from '../middlewares/groundAccess.js'

// Memory storage, not disk — the buffer goes straight to Cloudinary
// (uploadImageFileDetailed) and is never written to this server's
// filesystem. Same pattern as galleryImage.routes.js / canteenMenu.routes.js.
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

const router = express.Router()

// Phase 7 — this returns internal `id`/`cloudinary_public_id` across EVERY
// ground with no WHERE clause (findAllGroundPhotos), unlike the public
// ground-profile endpoint's ground-scoped, internal-field-free read
// (findGroundPhotosByGroundId). Its only real consumer is the super-admin
// photo management panel (client/src/hooks/useAdminPhotos.js) — the public
// AmenitiesGrid/ground-profile pages deliberately avoid this exact route
// (see AmenitiesGrid.jsx's own comment) precisely because it isn't
// ground-scoped. Was reachable with zero authentication; now matches the
// POST/upload/DELETE routes below.
router.get('/', requireAuth, requireStaffRole('super_admin'), listGroundPhotos)
router.post('/', requireAuth, requireStaffRole('super_admin'), attachSingleGroundContext, addGroundPhoto)
router.post('/upload', requireAuth, requireStaffRole('super_admin'), attachSingleGroundContext, uploadSingleImage, uploadGroundPhoto)
router.delete('/:id', requireAuth, requireStaffRole('super_admin'), removeGroundPhoto)

export default router
