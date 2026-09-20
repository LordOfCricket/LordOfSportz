import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import * as requestModel from '../models/groundOwnerRequest.model.js'
import * as photoModel from '../models/groundRegistrationPhoto.model.js'
import * as amenitySelectionModel from '../models/groundRegistrationAmenity.model.js'
import * as amenityCatalogModel from '../models/amenityCatalog.model.js'
import { createGround, findGroundBySlug } from '../models/ground.model.js'
import { createMembership } from '../models/groundUser.model.js'
import { findUserByIdentifier, createUserFromOtp, updateUser } from '../models/user.model.js'
import { insertMany as insertGroundPhotos } from '../models/groundPhoto.model.js'
import { insertMany as insertGroundAmenities } from '../models/groundAmenity.model.js'
import { recordEvent, ACCOUNT_AUDIT_EVENTS } from './accountAudit.service.js'
import { sendGroundApprovalEmail } from './emailService.js'
import { requiredText, optionalText, validateEmail, validatePhone, isValidHttpUrl } from '../domain/accountCreation/validation.js'
import { AccountCreationError, ACCOUNT_CREATION_ERROR_CODES as CODES } from '../domain/accountCreation/errors.js'
import { generatePublicId } from '../utils/publicId.js'
import { slugify } from '../utils/slug.js'
import { logger } from '../utils/logger.js'

const FIELD_LIMITS = { applicantName: 100, groundName: 150, groundDescription: 500, addressLine: 255, city: 100, state: 100, country: 100, postalCode: 20, groundPhone: 30, groundWebsite: 300, rejectionReason: 500, moreInfoNotes: 500 }

const REQUIRED_FEATURED_PHOTO_COUNT = 6
const MAX_GALLERY_PHOTOS = 20

const TEMP_CREDENTIAL_TTL_MS = 30 * 60 * 1000
const TEMP_CREDENTIAL_BYTE_LENGTH = 18

function generateTemporaryPassword() {
  return crypto.randomBytes(TEMP_CREDENTIAL_BYTE_LENGTH).toString('base64url')
}

function parseCoordinate(raw, min, max) {
  if (raw === undefined || raw === '' || raw === null) return { value: null }
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min || value > max) return { error: true }
  return { value }
}

// Ground Registration feature — a "staged" photo is whatever
// POST /ground-owner-requests/photos just returned (a real Cloudinary
// upload, no DB row yet — see groundOwnerRequest.controller.js#uploadPhoto).
// Never trust the client's url/publicId pairing beyond shape: they're
// opaque strings copied verbatim into ground_registration_photos, not
// re-derived from anything server-side, so a shape check (real http(s) URL,
// non-empty id) is the only validation possible here — same trust boundary
// isValidHttpUrl already draws for the legacy addGroundPhoto endpoint.
function validatePhotoList(list, { exactCount, maxCount, label }) {
  if (!Array.isArray(list)) return { error: `${label} must be a list of uploaded photos.` }
  if (exactCount !== undefined && list.length !== exactCount) {
    return { error: `Exactly ${exactCount} ${label} are required (received ${list.length}).` }
  }
  if (maxCount !== undefined && list.length > maxCount) {
    return { error: `No more than ${maxCount} ${label} are allowed.` }
  }
  for (const photo of list) {
    if (!photo || typeof photo !== 'object') return { error: `Each ${label} entry must be an uploaded photo.` }
    if (!isValidHttpUrl(photo.url)) return { error: `One of the ${label} has an invalid image URL.` }
    if (typeof photo.publicId !== 'string' || !photo.publicId.trim()) return { error: `One of the ${label} is missing its upload reference.` }
  }
  return { value: list }
}

async function validateAmenityKeys(rawKeys) {
  if (rawKeys === undefined || rawKeys === null) return { value: [] }
  if (!Array.isArray(rawKeys)) return { error: 'Amenities must be a list.' }
  const keys = [...new Set(rawKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()))]
  if (keys.length === 0) return { value: [] }
  const validKeys = await amenityCatalogModel.findActiveKeys(keys)
  const invalid = keys.filter((k) => !validKeys.includes(k))
  if (invalid.length > 0) return { error: `Unknown amenity selection: ${invalid.join(', ')}.` }
  return { value: keys }
}

// Shared by submitRequest (new) and resubmitRequest (edit-in-place after
// REJECTED/MORE_INFORMATION_REQUIRED) — the exact same rules apply to both;
// a resubmission is not allowed to be validated any more leniently than an
// original submission.
async function validateSubmissionFields(body) {
  const applicantName = requiredText(body.applicantName, FIELD_LIMITS.applicantName)
  if (applicantName.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Your name is required.')

  const applicantEmail = validateEmail(body.applicantEmail)
  if (applicantEmail.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Email must be a valid address.')
  const applicantPhone = validatePhone(body.applicantPhone)
  if (applicantPhone.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Phone number is not valid.')
  if (!applicantEmail.value && !applicantPhone.value) {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Provide at least one contact method: email or phone.')
  }

  const groundName = requiredText(body.groundName, FIELD_LIMITS.groundName)
  if (groundName.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, `Ground name is required (max ${FIELD_LIMITS.groundName} characters).`)
  const addressLine = requiredText(body.addressLine, FIELD_LIMITS.addressLine)
  if (addressLine.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Address is required.')
  const city = requiredText(body.city, FIELD_LIMITS.city)
  if (city.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'City is required.')
  const state = requiredText(body.state, FIELD_LIMITS.state)
  if (state.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'State is required.')
  const groundPhone = requiredText(body.groundPhone, FIELD_LIMITS.groundPhone)
  if (groundPhone.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'A contact phone number for the ground is required.')

  const groundDescription = requiredText(body.groundDescription, FIELD_LIMITS.groundDescription)
  if (groundDescription.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'About the Ground is required.')
  const postalCode = optionalText(body.postalCode, FIELD_LIMITS.postalCode)
  if (postalCode.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Postal code is too long.')
  const country = optionalText(body.country, FIELD_LIMITS.country)
  if (country.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Country is too long.')
  const groundEmail = validateEmail(body.groundEmail)
  if (groundEmail.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Ground email must be a valid address.')
  const groundWebsite = optionalText(body.groundWebsite, FIELD_LIMITS.groundWebsite)
  if (groundWebsite.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Website URL is too long.')

  const latitude = parseCoordinate(body.latitude, -90, 90)
  if (latitude.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Latitude must be a number between -90 and 90.')
  const longitude = parseCoordinate(body.longitude, -180, 180)
  if (longitude.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Longitude must be a number between -180 and 180.')

  // §16 — never trust a frontend `agreed = true` boolean without this
  // exact server-side check. `=== true` (not truthy) so 'true'/1/'yes'
  // from a malformed client never slips through.
  if (body.agreedToTerms !== true) {
    throw new AccountCreationError(CODES.VALIDATION_ERROR, 'You must agree to the LordOfCricket Terms & Conditions and Privacy Policy to submit.')
  }

  const featured = validatePhotoList(body.featuredPhotos, { exactCount: REQUIRED_FEATURED_PHOTO_COUNT, label: 'featured photos' })
  if (featured.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, featured.error)
  const gallery = validatePhotoList(body.galleryPhotos ?? [], { maxCount: MAX_GALLERY_PHOTOS, label: 'gallery photos' })
  if (gallery.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, gallery.error)

  const amenityKeysResult = await validateAmenityKeys(body.amenityKeys)
  if (amenityKeysResult.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, amenityKeysResult.error)

  return {
    applicantName: applicantName.value,
    applicantEmail: applicantEmail.value,
    applicantPhone: applicantPhone.value,
    groundName: groundName.value,
    groundDescription: groundDescription.value,
    addressLine: addressLine.value,
    city: city.value,
    state: state.value,
    country: country.value || 'India',
    postalCode: postalCode.value,
    latitude: latitude.value,
    longitude: longitude.value,
    groundPhone: groundPhone.value,
    groundEmail: groundEmail.value,
    groundWebsite: groundWebsite.value,
    featuredPhotos: featured.value,
    galleryPhotos: gallery.value,
    amenityKeys: amenityKeysResult.value,
  }
}

// `submittedByUserId` is passed explicitly by the caller (ground.controller.js
// #registerGround, from req.user.id) — never derived from anything in
// `body`, so a client can't claim someone else's account by supplying an
// arbitrary id in the request payload (§29/§36).
export async function submitRequest(body = {}, submittedByUserId = null) {
  const fields = await validateSubmissionFields(body)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const publicRequestId = generatePublicId('GOR', 8)
    const request = await requestModel.createRequest(
      {
        publicRequestId,
        applicantName: fields.applicantName,
        applicantEmail: fields.applicantEmail,
        applicantPhone: fields.applicantPhone,
        groundName: fields.groundName,
        groundDescription: fields.groundDescription,
        addressLine: fields.addressLine,
        city: fields.city,
        state: fields.state,
        country: fields.country,
        postalCode: fields.postalCode,
        latitude: fields.latitude,
        longitude: fields.longitude,
        groundPhone: fields.groundPhone,
        groundEmail: fields.groundEmail,
        groundWebsite: fields.groundWebsite,
        submittedByUserId,
        termsAgreedAt: new Date(),
      },
      client,
    )

    const orderedPhotos = [
      ...fields.featuredPhotos.map((p) => ({ ...p, isFeatured: true })),
      ...fields.galleryPhotos.map((p) => ({ ...p, isFeatured: false })),
    ]
    await photoModel.insertMany(request.id, orderedPhotos, client)
    await amenitySelectionModel.insertMany(request.id, fields.amenityKeys, client)

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_REQUEST_SUBMITTED,
      { actorUserId: submittedByUserId, targetRequestId: request.id, metadata: { groundName: request.ground_name, publicRequestId } },
      client,
    )

    await client.query('COMMIT')
    return request
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Public status check — deliberately returns only the fields the brief's
// §21 allows (status + safe reasons), never reviewed_by or any internal id.
export async function getPublicStatus(publicRequestId) {
  const request = await requestModel.findByPublicRequestId(publicRequestId)
  if (!request) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
  return {
    publicRequestId: request.public_request_id,
    groundName: request.ground_name,
    status: request.status,
    rejectionReason: request.status === 'REJECTED' ? request.rejection_reason : null,
    moreInfoNotes: request.status === 'MORE_INFORMATION_REQUIRED' ? request.more_info_notes : null,
    submittedAt: request.created_at,
  }
}

// Ground Registration feature — a super_admin needs to actually see the 6
// featured photos/amenities before approving, not just the text fields
// (§17/§26 both assume a real review, not a rubber stamp). N+1 per row is
// acceptable at admin-review-queue scale (a handful to a few dozen pending
// requests at a time), same cost tradeoff already accepted elsewhere in
// this codebase's per-row correlated subqueries (ground.model.js).
export async function listRequests(status) {
  const requests = await requestModel.listByStatus(status || null)
  return Promise.all(
    requests.map(async (request) => {
      const [photos, amenityKeys] = await Promise.all([photoModel.findByRequestId(request.id), amenitySelectionModel.findKeysByRequestId(request.id)])
      return { ...request, photos, amenityKeys }
    }),
  )
}

// Viewing the detail as super_admin is what "review started" means here —
// a PENDING request transitions to UNDER_REVIEW the first time someone
// opens it; already-further-along requests (UNDER_REVIEW, APPROVED, etc.)
// are returned as-is, no repeated audit spam on every subsequent view.
export async function getRequestDetail(publicRequestId, actorUserId) {
  let request = await requestModel.findByPublicRequestId(publicRequestId)
  if (!request) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')

  if (request.status === 'PENDING') {
    const updated = await requestModel.markUnderReview(publicRequestId)
    if (updated) {
      request = updated
      await recordEvent(ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_REQUEST_REVIEW_STARTED, { actorUserId, targetRequestId: request.id })
    }
  }
  return request
}

async function ensureUniqueSlug(name, client) {
  const base = slugify(name) || 'ground'
  if (!(await findGroundBySlug(base, client))) return base
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
    if (!(await findGroundBySlug(candidate, client))) return candidate
  }
  throw new Error('Could not generate a unique ground slug.')
}

// The transactional core of Phase 4: approving a request must create the
// owner's account (if new), the ground, and the ownership membership, mark
// the request APPROVED, and write the audit event — all atomically, via one
// `pg` transaction (see models/groundOwnerRequest.model.js's header comment
// for why this isn't Prisma). If anything after the WHERE-clause-guarded
// UPDATE fails, everything rolls back and the request is left exactly as it
// was — never "owner created but ground missing" or "approved but nothing
// else happened".
export async function approveRequest(publicRequestId, actorUserId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Intentionally NOT step-up-gated (see docs/MFA.md) — Ground Approval
    // is exempt by design; requireStaffRole('super_admin') on the route
    // (groundOwnerRequest.routes.js) is the authorization boundary here.
    //
    // This UPDATE's own WHERE clause is the concurrency guard (brief §22):
    // a second simultaneous/duplicate approve attempt matches zero rows and
    // gets REQUEST_NOT_ELIGIBLE, never a second ground/owner.
    const request = await requestModel.markApprovedIfEligible(publicRequestId, { reviewedBy: actorUserId, createdGroundId: null }, client)
    if (!request) {
      await client.query('ROLLBACK')
      const existing = await requestModel.findByPublicRequestId(publicRequestId)
      if (!existing) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
      throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, `This request has already been decided (status: ${existing.status}).`)
    }

    let user = await findUserByIdentifier(request.applicant_email || request.applicant_phone, request.applicant_email ? 'EMAIL' : 'PHONE', client)
    const isNewUser = !user
    if (!user) {
      user = await createUserFromOtp(
        { identifier: request.applicant_email || request.applicant_phone, identifierType: request.applicant_email ? 'EMAIL' : 'PHONE', name: request.applicant_name },
        client,
      )
    }

    const temporaryPassword = generateTemporaryPassword()
    const tempHash = await bcrypt.hash(temporaryPassword, 10)
    const tempExpiresAt = new Date(Date.now() + TEMP_CREDENTIAL_TTL_MS)

    await updateUser(
      user.id,
      { temp_password_hash: tempHash, temp_password_expires_at: tempExpiresAt, force_password_change: true },
      client,
    )

    const slug = await ensureUniqueSlug(request.ground_name, client)
    const ground = await createGround(
      {
        publicGroundId: generatePublicId('GRD', 8),
        slug,
        name: request.ground_name,
        description: request.ground_description,
        addressLine: request.address_line,
        city: request.city,
        state: request.state,
        country: request.country,
        postalCode: request.postal_code,
        latitude: request.latitude,
        longitude: request.longitude,
        phone: request.ground_phone,
        email: request.ground_email,
        website: request.ground_website,
        status: 'ACTIVE', // approval is what makes it public — matches the pre-Phase-4 "approve activates it" semantic
      },
      client,
    )

    await createMembership({ groundId: ground.id, userId: user.id, role: 'GROUND_OWNER', isActive: true }, client)

    // Ground Registration feature — copy the request's staged photos/
    // amenities into their real, ground-scoped counterparts now that a real
    // ground_id exists. Mirrors exactly how the request's own name/address
    // fields above just got copied into `ground` — the request-scoped rows
    // stay in place afterward (CASCADE-deleted only if the request itself
    // is ever deleted), they just stop being the live source once approved.
    const registeredPhotos = await photoModel.findByRequestId(request.id, client)
    await insertGroundPhotos(
      ground.id,
      registeredPhotos.map((p) => ({ imageUrl: p.image_url, cloudinaryPublicId: p.cloudinary_public_id, isFeatured: p.is_featured, sortOrder: p.sort_order })),
      client,
    )
    const registeredAmenityKeys = await amenitySelectionModel.findKeysByRequestId(request.id, client)
    await insertGroundAmenities(ground.id, registeredAmenityKeys, client)

    // Re-run the UPDATE now that we know the real ground id (the guard UPDATE
    // above intentionally didn't have it yet, so the eligibility check could
    // run before any other write happened).
    await client.query(`UPDATE ground_owner_requests SET created_ground_id = $2 WHERE id = $1`, [request.id, ground.id])

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_APPROVED,
      { actorUserId, targetUserId: user.id, targetRequestId: request.id, metadata: { groundPublicId: ground.public_ground_id, groundName: ground.name } },
      client,
    )

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.TEMPORARY_CREDENTIAL_GENERATED,
      { actorUserId, targetUserId: user.id, targetRequestId: request.id, metadata: { expiresAt: tempExpiresAt.toISOString(), reason: 'ground_approval' } },
      client,
    )

    await client.query('COMMIT')
    logger.info('Ground owner request approved', { publicRequestId, userId: user.id, groundPublicId: ground.public_ground_id })

    const approvalResult = { request: { ...request, status: 'APPROVED', created_ground_id: ground.id }, user, ground, temporaryPassword, tempExpiresAt }

    try {
      const loginUrl = process.env.APP_URL || 'https://lordofcricket.com'
      await sendGroundApprovalEmail({
        recipientEmail: request.applicant_email,
        recipientName: request.applicant_name,
        temporaryPassword,
        loginUrl,
      })
      logger.info('Ground approval email sent', { userId: user.id, email: request.applicant_email })
    } catch (emailErr) {
      logger.error('Failed to send ground approval email', { userId: user.id, email: request.applicant_email, error: emailErr.message })
    }

    return approvalResult
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function rejectRequest(publicRequestId, actorUserId, reason) {
  const reasonResult = requiredText(reason, FIELD_LIMITS.rejectionReason)
  if (reasonResult.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'A rejection reason is required.')

  const request = await requestModel.markRejected(publicRequestId, { reviewedBy: actorUserId, reason: reasonResult.value })
  if (!request) {
    const existing = await requestModel.findByPublicRequestId(publicRequestId)
    if (!existing) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
    throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, `This request has already been decided (status: ${existing.status}).`)
  }

  await recordEvent(ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_REJECTED, { actorUserId, targetRequestId: request.id, metadata: { reason: reasonResult.value } })
  return request
}

export async function requestMoreInformation(publicRequestId, actorUserId, notes) {
  const notesResult = requiredText(notes, FIELD_LIMITS.moreInfoNotes)
  if (notesResult.error) throw new AccountCreationError(CODES.VALIDATION_ERROR, 'Notes describing what is needed are required.')

  const request = await requestModel.markMoreInfoRequested(publicRequestId, { reviewedBy: actorUserId, notes: notesResult.value })
  if (!request) {
    const existing = await requestModel.findByPublicRequestId(publicRequestId)
    if (!existing) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
    throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, `This request has already been decided (status: ${existing.status}).`)
  }

  await recordEvent(ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_MORE_INFO_REQUESTED, { actorUserId, targetRequestId: request.id, metadata: { notes: notesResult.value } })
  return request
}

// "My Ground Registrations" (§20/§21) — every request THIS user themselves
// submitted, keyed by submitted_by_user_id, never applicant_email/phone
// string matching (see schema.sql's comment on that column).
export async function listMyRequests(userId) {
  return requestModel.findByUserId(userId)
}

async function loadOwnedRequest(publicRequestId, userId) {
  const request = await requestModel.findByPublicRequestId(publicRequestId)
  if (!request) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
  // §29 — a Ground Owner must never read or act on another owner's
  // registration, even by guessing/enumerating a valid-looking reference id.
  if (request.submitted_by_user_id !== userId) {
    throw new AccountCreationError(CODES.REQUEST_NOT_OWNED, 'This registration does not belong to your account.')
  }
  return request
}

// Owner-facing full detail (resubmit pre-fill, the authenticated status
// page) — unlike getPublicStatus/getRequestDetail (super_admin), this is
// scoped to the caller's OWN request and includes the photos/amenities the
// public/admin views don't need.
export async function getMyRequestDetail(publicRequestId, userId) {
  const request = await loadOwnedRequest(publicRequestId, userId)
  const [photos, amenityKeys] = await Promise.all([photoModel.findByRequestId(request.id), amenitySelectionModel.findKeysByRequestId(request.id)])
  return { request, photos, amenityKeys }
}

// Edit & Resubmit (§25) — only reachable from REJECTED/MORE_INFORMATION_
// REQUIRED (enforced by markResubmitted's own guarded WHERE clause, same
// concurrency-safe shape as approve/reject/request-information), and only
// by the request's own submitter. Re-validated with the exact same rules a
// fresh submission uses — never a lighter-touch "just patch the one broken
// field" path, since the brief only requires the owner not have to
// re-*enter* everything from scratch (the wizard pre-fills from
// getMyRequestDetail), not that the server trust it un-revalidated.
export async function resubmitRequest(publicRequestId, userId, body) {
  await loadOwnedRequest(publicRequestId, userId)
  const fields = await validateSubmissionFields(body)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const request = await requestModel.markResubmitted(
      publicRequestId,
      {
        groundName: fields.groundName,
        groundDescription: fields.groundDescription,
        addressLine: fields.addressLine,
        city: fields.city,
        state: fields.state,
        country: fields.country,
        postalCode: fields.postalCode,
        latitude: fields.latitude,
        longitude: fields.longitude,
        groundPhone: fields.groundPhone,
        groundEmail: fields.groundEmail,
        groundWebsite: fields.groundWebsite,
        termsAgreedAt: new Date(),
      },
      client,
    )
    if (!request) {
      await client.query('ROLLBACK')
      const existing = await requestModel.findByPublicRequestId(publicRequestId)
      if (!existing) throw new AccountCreationError(CODES.REQUEST_NOT_FOUND, 'Request not found.')
      throw new AccountCreationError(CODES.REQUEST_NOT_ELIGIBLE, `This request can no longer be resubmitted (status: ${existing.status}).`)
    }

    await photoModel.deleteByRequestId(request.id, client)
    const orderedPhotos = [
      ...fields.featuredPhotos.map((p) => ({ ...p, isFeatured: true })),
      ...fields.galleryPhotos.map((p) => ({ ...p, isFeatured: false })),
    ]
    await photoModel.insertMany(request.id, orderedPhotos, client)

    await amenitySelectionModel.deleteByRequestId(request.id, client)
    await amenitySelectionModel.insertMany(request.id, fields.amenityKeys, client)

    await recordEvent(
      ACCOUNT_AUDIT_EVENTS.GROUND_OWNER_REQUEST_RESUBMITTED,
      { actorUserId: userId, targetRequestId: request.id, metadata: { groundName: request.ground_name, publicRequestId } },
      client,
    )

    await client.query('COMMIT')
    return request
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
