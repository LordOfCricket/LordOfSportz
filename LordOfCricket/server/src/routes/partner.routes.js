import express from 'express'
import multer from 'multer'
import {
  listPartners,
  listAllPartnersAdmin,
  addPartner,
  uploadPartner,
  updatePartnerHandler,
  removePartner,
} from '../controllers/partner.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'

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
  upload.single('logo')(req, res, (err) => {
    if (!err) return next()
    err.statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 10MB or smaller.'
    next(err)
  })
}

const router = express.Router()

router.get('/', listPartners)
router.get('/admin', requireAuth, requireStaffRole('super_admin'), listAllPartnersAdmin)
router.post('/', requireAuth, requireStaffRole('super_admin'), addPartner)
router.post('/upload', requireAuth, requireStaffRole('super_admin'), uploadSingleImage, uploadPartner)
router.patch('/:id', requireAuth, requireStaffRole('super_admin'), uploadSingleImage, updatePartnerHandler)
router.delete('/:id', requireAuth, requireStaffRole('super_admin'), removePartner)

export default router
