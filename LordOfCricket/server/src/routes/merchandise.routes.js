import express from 'express'
import multer from 'multer'
import {
  listPublicMerchandise,
  listAdminMerchandise,
  getPublicMerchandise,
  getAdminMerchandise,
  createMerchandiseHandler,
  updateMerchandiseHandler,
  deleteMerchandiseHandler,
} from '../controllers/merchandise.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

// Memory storage, not disk — the buffer goes straight to Cloudinary
// (uploadImageFileDetailed) and is never written to this server's
// filesystem. Same pattern as partner.routes.js / galleryImage.routes.js.
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
  upload.single('image')(req, res, (err) => {
    if (!err) return next()
    err.statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 10MB or smaller.'
    next(err)
  })
}

const router = express.Router()

const superAdminOnly = [requireAuth, requireStaffRole('super_admin')]

// Public — the LOC homepage's MerchandiseSection.jsx and the product detail page.
router.get('/', listPublicMerchandise)

// Admin — every product, any status. Registered before '/:id' so the literal
// "admin" segment is never captured as an id.
router.get('/admin', ...superAdminOnly, listAdminMerchandise)
router.get('/admin/:id', ...superAdminOnly, getAdminMerchandise)

router.get('/:id', getPublicMerchandise)

router.post('/', ...superAdminOnly, uploadSingleImage, createMerchandiseHandler)
router.patch('/:id', ...superAdminOnly, uploadSingleImage, updateMerchandiseHandler)
router.delete('/:id', ...superAdminOnly, deleteMerchandiseHandler)

export default router
