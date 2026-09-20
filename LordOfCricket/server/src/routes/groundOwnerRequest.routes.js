import { Router } from 'express'
import multer from 'multer'
import {
  submit, getStatus, list, getDetail, approve, reject, requestInformation,
  uploadPhoto, listAmenityCatalog, sendContactVerificationCode, verifyContactVerificationCode,
  lookupRequestCode, lookupVerify, listMine, getMyDetail, resubmit,
} from '../controllers/groundOwnerRequest.controller.js'
import { requireAuth, requireStaffRole } from '../middlewares/auth.js'
import { groundWriteLimiter, otpRequestLimiter, otpVerifyLimiter } from '../middlewares/rateLimit.js'

// Mounted at /api/ground-owner-requests. Replaces the old self-serve
// POST /grounds + GET/PATCH /ground-review pair (ground.controller.js#
// registerGround / groundReview.controller.js) — those now just forward
// here (see their own files) rather than existing as a second, competing
// registration path with the bug this phase fixes: membership was
// previously granted at submission time, before any review.
//
// Ground Registration feature — every route below with a literal path
// segment ('/status/:id', '/lookup/...', '/photos', '/amenity-catalog',
// '/contact-verification/...', '/mine', '/:publicRequestId/mine') MUST stay
// registered before the bare '/:publicRequestId' (super_admin) route
// further down, same footgun already documented for '/status/:publicRequestId'
// — Express matches in registration order and '/:publicRequestId' would
// otherwise swallow a literal first segment. PUT '/:publicRequestId' is
// method-distinct from the GET on the same pattern, so it has no ordering
// concern (mirrors ground.routes.js's own POST '/' vs GET '/' reasoning).
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

router.post('/', groundWriteLimiter, submit)
router.get('/status/:publicRequestId', getStatus)

// Ground Registration feature — public, no-login "find my registrations".
router.post('/lookup/request-code', otpRequestLimiter, lookupRequestCode)
router.post('/lookup/verify', otpVerifyLimiter, lookupVerify)

// Ground Registration feature — authenticated wizard support endpoints.
router.get('/amenity-catalog', listAmenityCatalog)
router.post('/photos', requireAuth, groundWriteLimiter, uploadSinglePhoto, uploadPhoto)
router.post('/contact-verification/send-code', requireAuth, otpRequestLimiter, sendContactVerificationCode)
router.post('/contact-verification/verify-code', requireAuth, otpVerifyLimiter, verifyContactVerificationCode)
router.get('/mine', requireAuth, listMine)
router.get('/:publicRequestId/mine', requireAuth, getMyDetail)
router.put('/:publicRequestId', requireAuth, groundWriteLimiter, resubmit)

router.get('/', requireAuth, requireStaffRole('super_admin'), list)
router.get('/:publicRequestId', requireAuth, requireStaffRole('super_admin'), getDetail)
router.post('/:publicRequestId/approve', requireAuth, requireStaffRole('super_admin'), approve)
router.post('/:publicRequestId/reject', requireAuth, requireStaffRole('super_admin'), reject)
router.post('/:publicRequestId/request-information', requireAuth, requireStaffRole('super_admin'), requestInformation)

export default router
