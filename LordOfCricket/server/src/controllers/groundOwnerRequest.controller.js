import * as groundOwnerRequestService from '../services/groundOwnerRequest.service.js'
import * as groundContactVerificationService from '../services/groundContactVerification.service.js'
import * as groundRegistrationLookupService from '../services/groundRegistrationLookup.service.js'
import { findAllActive as findActiveAmenityCatalog } from '../models/amenityCatalog.model.js'
import { uploadImageFileDetailed } from '../utils/cloudinaryUpload.js'
import { logger } from '../utils/logger.js'

const REGISTRATION_PHOTO_CLOUDINARY_FOLDER = 'LOC/ground-registration-photos'

// Ground Registration feature — the one place that maps the frontend
// wizard's HTTP body shape (name/description/addressLine/phone/email/...,
// exactly what groundRegistration.model.js#buildSubmissionPayload on the
// client produces) onto submitRequest/resubmitRequest's shape
// (groundName/groundDescription/groundPhone/groundEmail/...), with
// applicant identity always derived from the authenticated session, never
// the request body (§29/§36). Shared by ground.controller.js#registerGround
// (create) and resubmit below (edit) — both are authenticated, logged-in
// entry points, and previously only the first one actually did this
// mapping, which meant every resubmit call failed validation outright
// (missing applicantName/Email/Phone the service requires).
export function mapRegistrationBody(body, user) {
  return {
    applicantName: user.name,
    applicantEmail: user.email,
    applicantPhone: user.phone,
    groundName: body.name,
    groundDescription: body.description,
    addressLine: body.addressLine,
    city: body.city,
    state: body.state,
    country: body.country,
    postalCode: body.postalCode,
    latitude: body.latitude,
    longitude: body.longitude,
    groundPhone: body.phone,
    groundEmail: body.email,
    groundWebsite: body.website,
    agreedToTerms: body.agreedToTerms,
    featuredPhotos: body.featuredPhotos,
    galleryPhotos: body.galleryPhotos,
    amenityKeys: body.amenityKeys,
  }
}

// Admin-facing shape (list/detail) — includes reviewed_by/internal
// timestamps that the public status-check endpoint below deliberately never
// returns (see getStatus / groundOwnerRequestService#getPublicStatus).
// photos/amenityKeys/termsAgreedAt (Ground Registration feature) let a
// super_admin actually see what they're approving, not just the text
// fields — populated only where the caller passes them (getDetail below).
function serializeRequestAdmin(row, { photos, amenityKeys } = {}) {
  return {
    publicRequestId: row.public_request_id,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    applicantPhone: row.applicant_phone,
    groundName: row.ground_name,
    groundDescription: row.ground_description,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    country: row.country,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    groundPhone: row.ground_phone,
    groundEmail: row.ground_email,
    groundWebsite: row.ground_website,
    status: row.status,
    rejectionReason: row.rejection_reason,
    moreInfoNotes: row.more_info_notes,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdGroundId: row.created_ground_id,
    termsAgreedAt: row.terms_agreed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(photos ? { photos: photos.map((p) => ({ imageUrl: p.image_url, isFeatured: p.is_featured, sortOrder: p.sort_order })) } : {}),
    ...(amenityKeys ? { amenityKeys } : {}),
  }
}

// Owner-facing shape ("My Ground Registrations", the authenticated status
// page, resubmit pre-fill) — everything the owner themselves entered,
// still never reviewed_by (an internal reviewer identity, not their
// business).
function serializeRequestOwner(row, { photos, amenityKeys } = {}) {
  return {
    publicRequestId: row.public_request_id,
    applicantName: row.applicant_name,
    applicantEmail: row.applicant_email,
    applicantPhone: row.applicant_phone,
    groundName: row.ground_name,
    groundDescription: row.ground_description,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    country: row.country,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    groundPhone: row.ground_phone,
    groundEmail: row.ground_email,
    groundWebsite: row.ground_website,
    status: row.status,
    rejectionReason: row.rejection_reason,
    moreInfoNotes: row.more_info_notes,
    submittedAt: row.created_at,
    ...(photos ? { photos: photos.map((p) => ({ imageUrl: p.image_url, publicId: p.cloudinary_public_id, isFeatured: p.is_featured, sortOrder: p.sort_order })) } : {}),
    ...(amenityKeys ? { amenityKeys } : {}),
  }
}

// Public, no-login submission (the original, fully-anonymous entry point —
// still reachable, still requires everything submitRequest now validates,
// including agreedToTerms/photos/amenities). The frontend's own wizard uses
// the authenticated POST /grounds path instead (ground.controller.js
// #registerGround), which derives applicant identity from the session.
export async function submit(req, res, next) {
  try {
    const request = await groundOwnerRequestService.submitRequest(req.body)
    res.status(201).json({ request: { publicRequestId: request.public_request_id, groundName: request.ground_name, status: request.status } })
  } catch (err) {
    next(err)
  }
}

// Ground Registration feature — choose-from-device upload for one featured/
// gallery photo, mirroring the exact groundPhoto/amenity/player-photo
// upload pattern (multer memory storage -> Cloudinary stream). No DB row
// yet — the wizard hasn't created a request at this point (a Ground Owner
// may abandon the form after uploading a few photos), so this returns just
// the Cloudinary reference; the actual ground_registration_photos rows are
// created together, atomically, when the request itself is (or resubmit
// replaces them) — see groundOwnerRequest.service.js#submitRequest.
export async function uploadPhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'photo file is required' })
    }
    const uploaded = await uploadImageFileDetailed(req.file, REGISTRATION_PHOTO_CLOUDINARY_FOLDER)
    res.status(201).json({ url: uploaded.url, publicId: uploaded.publicId })
  } catch (err) {
    next(err)
  }
}

export async function listAmenityCatalog(req, res, next) {
  try {
    const amenities = await findActiveAmenityCatalog()
    res.json({ amenities })
  } catch (err) {
    next(err)
  }
}

// Ground Registration feature — an authenticated Ground Owner adding/
// verifying a contact value their account is missing (the common case
// already has both, from the New Signup Flow's dual verification — see
// groundContactVerification.service.js's header).
export async function sendContactVerificationCode(req, res, next) {
  try {
    const { identifier } = req.body
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required.' })
    }
    await groundContactVerificationService.requestContactVerification(req.user, identifier)
    res.json({ message: 'If that email or phone number is valid, a code has been sent.' })
  } catch (err) {
    next(err)
  }
}

export async function verifyContactVerificationCode(req, res, next) {
  try {
    const { identifier, code } = req.body
    if (!identifier || !code) {
      return res.status(400).json({ message: 'identifier and code are required.' })
    }
    const user = await groundContactVerificationService.verifyContactVerification(req.user, identifier, code)
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

// Public, no-login "find my registrations" (brief §22) — OTP-gated, never
// exposes anything just because someone knows a reference id's identifier.
export async function lookupRequestCode(req, res, next) {
  try {
    const { identifier } = req.body
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ message: 'identifier is required.' })
    }
    await groundRegistrationLookupService.requestLookupCode(identifier)
    res.json({ message: 'If that email or phone number has any registrations, a code has been sent.' })
  } catch (err) {
    next(err)
  }
}

export async function lookupVerify(req, res, next) {
  try {
    const { identifier, code } = req.body
    if (!identifier || !code) {
      return res.status(400).json({ message: 'identifier and code are required.' })
    }
    const requests = await groundRegistrationLookupService.verifyLookupAndList(identifier, code)
    res.json({ requests })
  } catch (err) {
    next(err)
  }
}

// "My Ground Registrations" (§20/§21) — authenticated, scoped to the
// caller's own submissions only.
export async function listMine(req, res, next) {
  try {
    const requests = await groundOwnerRequestService.listMyRequests(req.user.id)
    res.json({ requests: requests.map((r) => serializeRequestOwner(r)) })
  } catch (err) {
    next(err)
  }
}

export async function getMyDetail(req, res, next) {
  try {
    const { request, photos, amenityKeys } = await groundOwnerRequestService.getMyRequestDetail(req.params.publicRequestId, req.user.id)
    res.json({ request: serializeRequestOwner(request, { photos, amenityKeys }) })
  } catch (err) {
    next(err)
  }
}

// Edit & Resubmit (§25) — req.user.id is the ownership key, never a
// client-supplied id (§29/§36).
export async function resubmit(req, res, next) {
  try {
    const request = await groundOwnerRequestService.resubmitRequest(req.params.publicRequestId, req.user.id, mapRegistrationBody(req.body, req.user))
    res.json({ request: serializeRequestOwner(request) })
  } catch (err) {
    next(err)
  }
}

// Public status check by reference id — safe fields only (§21), enforced
// inside the service, not here.
export async function getStatus(req, res, next) {
  try {
    const status = await groundOwnerRequestService.getPublicStatus(req.params.publicRequestId)
    res.json({ request: status })
  } catch (err) {
    next(err)
  }
}

export async function list(req, res, next) {
  try {
    const requests = await groundOwnerRequestService.listRequests(req.query.status)
    res.json({ requests: requests.map((r) => serializeRequestAdmin(r, { photos: r.photos, amenityKeys: r.amenityKeys })) })
  } catch (err) {
    next(err)
  }
}

export async function getDetail(req, res, next) {
  try {
    const request = await groundOwnerRequestService.getRequestDetail(req.params.publicRequestId, req.user.id)
    res.json({ request: serializeRequestAdmin(request) })
  } catch (err) {
    next(err)
  }
}

export async function approve(req, res, next) {
  try {
    const { request, ground } = await groundOwnerRequestService.approveRequest(req.params.publicRequestId, req.user.id)
    res.json({ request: serializeRequestAdmin(request), ground: { publicGroundId: ground.public_ground_id, slug: ground.slug, name: ground.name, status: ground.status } })
  } catch (err) {
    next(err)
  }
}

export async function reject(req, res, next) {
  try {
    const request = await groundOwnerRequestService.rejectRequest(req.params.publicRequestId, req.user.id, req.body?.reason)
    res.json({ request: serializeRequestAdmin(request) })
  } catch (err) {
    next(err)
  }
}

export async function requestInformation(req, res, next) {
  try {
    const request = await groundOwnerRequestService.requestMoreInformation(req.params.publicRequestId, req.user.id, req.body?.notes)
    res.json({ request: serializeRequestAdmin(request) })
  } catch (err) {
    next(err)
  }
}
