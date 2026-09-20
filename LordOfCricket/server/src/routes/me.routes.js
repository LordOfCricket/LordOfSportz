import { Router } from 'express'
import multer from 'multer'
import { getMyPlayer, updateMyPlayer, uploadMyPlayerPhoto } from '../controllers/player.controller.js'
import { requireAuth } from '../middlewares/auth.js'

// Memory storage, not disk — same pattern as groundPhoto.routes.js/
// amenity.routes.js: the buffer goes straight to Cloudinary and is never
// written to this server's filesystem.
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

function uploadSinglePhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next()
    err.statusCode = 400
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 10MB or smaller.'
    next(err)
  })
}

const router = Router()

router.get('/player', requireAuth, getMyPlayer)
router.patch('/player', requireAuth, updateMyPlayer)
router.post('/player/photo', requireAuth, uploadSinglePhoto, uploadMyPlayerPhoto)

export default router
