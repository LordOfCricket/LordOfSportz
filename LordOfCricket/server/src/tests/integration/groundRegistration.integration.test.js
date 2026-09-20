// Phase 4 — Ground Owner registration is now request/approval, not
// immediate self-serve. POST /grounds (still requireAuth, unchanged route)
// creates a PENDING ground_owner_requests row instead of an ACTIVE-bound
// DRAFT ground + immediate GROUND_OWNER membership (the bug this phase
// fixes — see ground.controller.js#registerGround and
// groundOwnerRequest.service.js). The old GET/PATCH /ground-review admin
// queue is retired; /ground-owner-requests replaces it.
//
// Ground Registration feature — extends this same file: exactly-6 featured
// photos, optional gallery, catalog-based amenities, mandatory terms
// agreement (all server-enforced, never trusted from the client), "My
// Ground Registrations", Edit & Resubmit, and the OTP-gated public lookup.
//
// POST /grounds and PUT /ground-owner-requests/:id both sit behind
// groundWriteLimiter (max 10/10min, in-memory, shared across this whole
// test file's one process). Field-validation tests (terms/photo-count/
// amenity-key/gallery-cap) don't need real HTTP routing at all, so they
// call groundOwnerRequestService.submitRequest/resubmitRequest directly —
// same established pattern as otpAuth.integration.test.js's resend-cooldown
// test and signup.integration.test.js. Real HTTP (http.createServer(app),
// plain fetch(), no mocking) is reserved for genuinely HTTP-layer
// behavior: auth guards, the full submit->approve/reject/resubmit flows,
// ownership isolation, and the one real Cloudinary upload test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { mintMfaVerifiedSessionCookie, mintStepUpGrant } from './helpers/mfaFixtures.js'
import { uploadImageFileDetailed, deleteImageByPublicId } from '../../utils/cloudinaryUpload.js'
import * as groundOwnerRequestService from '../../services/groundOwnerRequest.service.js'
import * as groundContactVerificationService from '../../services/groundContactVerification.service.js'
import * as groundRegistrationLookupService from '../../services/groundRegistrationLookup.service.js'
import { AccountCreationError } from '../../domain/accountCreation/errors.js'
import { OtpAuthError } from '../../domain/otpAuth/errors.js'

// Hermetic — contact-verification/lookup send real OTP codes via
// otp.service.js, which picks Twilio Verify for phone whenever real
// credentials are configured (they are, in this project's .env). Fake test
// phone numbers aren't real Twilio-verified numbers, so a real Twilio call
// would fail outright; deleting these forces the console-fallback provider,
// same established pattern as signup.integration.test.js/
// playerOnboarding.integration.test.js.
delete process.env.TWILIO_ACCOUNT_SID
delete process.env.TWILIO_API_KEY
delete process.env.TWILIO_API_SECRET
delete process.env.TWILIO_VERIFY_SERVICE_SID
delete process.env.SENDGRID_API_KEY
delete process.env.SENDGRID_FROM_EMAIL

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', staffRoleId = null, withEmail = true, withPhone = true } = {}) {
  const tag = uniqueTag()
  const email = withEmail ? `integration-test-greg-${label}-${tag}@example.test` : null
  const phone = withPhone ? `+91${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 10)}` : null
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, staff_role_id) VALUES ($1,$2,$3,'not-a-real-hash',$4,$5) RETURNING *`,
      [`Integration Test ${label}`, email, phone, role, staffRoleId],
    )
  ).rows[0]
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function cookieHeader(cookie) {
  return { Cookie: cookie, 'Content-Type': 'application/json' }
}

function fakePhotos(count, tag) {
  return Array.from({ length: count }, (_, i) => ({ url: `https://res.cloudinary.com/demo/image/upload/v1/${tag}-${i}.jpg`, publicId: `${tag}-${i}` }))
}

const AMENITY_KEYS = ['wifi', 'parking']

function validRegistrationBody(label, overrides = {}) {
  const tag = uniqueTag()
  return {
    name: `Integration Test Ground ${label} ${tag}`,
    description: 'A real cricket ground submitted for review.',
    addressLine: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    postalCode: '110001',
    phone: '9999999999',
    email: 'owner@example.test',
    website: 'https://example.test',
    agreedToTerms: true,
    featuredPhotos: fakePhotos(6, `${label}-${tag}`),
    galleryPhotos: [],
    amenityKeys: AMENITY_KEYS,
    ...overrides,
  }
}

// Direct-service variant of validRegistrationBody — matches the field
// names submitRequest itself expects (applicantName/groundName/... instead
// of the HTTP layer's name/description/... — see ground.controller.js
// #registerGround's own mapping between the two shapes).
function serviceBody(label, applicant, overrides = {}) {
  const http = validRegistrationBody(label, overrides)
  return {
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    applicantPhone: applicant.phone,
    groundName: http.name,
    groundDescription: http.description,
    addressLine: http.addressLine,
    city: http.city,
    state: http.state,
    postalCode: http.postalCode,
    groundPhone: http.phone,
    groundEmail: http.email,
    groundWebsite: http.website,
    agreedToTerms: http.agreedToTerms,
    featuredPhotos: http.featuredPhotos,
    galleryPhotos: http.galleryPhotos,
    amenityKeys: http.amenityKeys,
  }
}

// Creates a baseline PENDING request without going through the rate-limited
// POST /grounds HTTP route — used by tests whose actual subject is a LATER
// action (approve/reject/resubmit/mine), not submission itself, to keep
// this whole file's real HTTP POST /grounds usage well under
// groundWriteLimiter's 10/10min ceiling.
async function createPendingRequest(owner, label) {
  const req = await groundOwnerRequestService.submitRequest(serviceBody(label, { name: `Owner ${owner.id}`, email: owner.email, phone: owner.phone }), owner.id)
  return req.public_request_id
}

async function cleanupRequestByPublicId(publicRequestId) {
  if (!publicRequestId) return
  const { rows } = await pool.query('SELECT * FROM ground_owner_requests WHERE public_request_id = $1', [publicRequestId])
  const request = rows[0]
  if (!request) return
  if (request.created_ground_id) {
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [request.created_ground_id])
    await pool.query('DELETE FROM ground_amenities WHERE ground_id = $1', [request.created_ground_id])
    await pool.query('DELETE FROM ground_photos WHERE ground_id = $1', [request.created_ground_id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [request.created_ground_id])
  }
  await pool.query('DELETE FROM account_audit_log WHERE target_request_id = $1', [request.id])
  await pool.query('DELETE FROM ground_registration_photos WHERE request_id = $1', [request.id])
  await pool.query('DELETE FROM ground_registration_amenities WHERE request_id = $1', [request.id])
  await pool.query('DELETE FROM ground_owner_requests WHERE id = $1', [request.id])
}

async function assertRejects(promise) {
  try {
    await promise
    assert.fail('expected the submission to be rejected')
  } catch (err) {
    assert.ok(err instanceof AccountCreationError, `expected an AccountCreationError, got ${err.constructor.name}: ${err.message}`)
    return err
  }
}

// --- Field validation (direct service calls — no HTTP, no rate limit) ------

test('submitRequest: rejects a missing required field (name)', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('missing-name', applicant)
  delete body.groundName
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects a missing required field (phone)', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('missing-phone', applicant)
  delete body.groundPhone
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects a missing About the Ground (now required)', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('missing-about', applicant)
  delete body.groundDescription
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects an invalid ground email', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('bad-email', applicant, {})
  body.groundEmail = 'not-an-email'
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects submission when agreedToTerms is missing, false, or a truthy non-boolean — never trusts a frontend boolean', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const missing = serviceBody('no-terms-missing', applicant)
  delete missing.agreedToTerms
  await assertRejects(groundOwnerRequestService.submitRequest(missing))

  const falseBody = serviceBody('no-terms-false', applicant, {})
  falseBody.agreedToTerms = false
  await assertRejects(groundOwnerRequestService.submitRequest(falseBody))

  const truthyString = serviceBody('no-terms-truthy', applicant, {})
  truthyString.agreedToTerms = 'true'
  await assertRejects(groundOwnerRequestService.submitRequest(truthyString))
})

test('submitRequest: rejects fewer than 6 featured photos', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('five-photos', applicant, { featuredPhotos: fakePhotos(5, 'five') })
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects more than 6 featured photos', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('seven-photos', applicant, { featuredPhotos: fakePhotos(7, 'seven') })
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: rejects a malformed featured photo entry (invalid URL / missing publicId)', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const badUrl = serviceBody('bad-url', applicant, { featuredPhotos: [...fakePhotos(5, 'ok'), { url: 'not-a-url', publicId: 'x' }] })
  await assertRejects(groundOwnerRequestService.submitRequest(badUrl))

  const missingId = serviceBody('missing-id', applicant, { featuredPhotos: [...fakePhotos(5, 'ok2'), { url: 'https://res.cloudinary.com/x.jpg', publicId: '' }] })
  await assertRejects(groundOwnerRequestService.submitRequest(missingId))
})

test('submitRequest: gallery photos are optional — an empty array and no gallery field at all both succeed', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  let id1, id2
  try {
    const req1 = await groundOwnerRequestService.submitRequest(serviceBody('no-gallery-empty', applicant, { galleryPhotos: [] }))
    id1 = req1.public_request_id
    assert.equal(req1.status, 'PENDING')

    const body2 = serviceBody('no-gallery-absent', applicant)
    delete body2.galleryPhotos
    const req2 = await groundOwnerRequestService.submitRequest(body2)
    id2 = req2.public_request_id
    assert.equal(req2.status, 'PENDING')
  } finally {
    await cleanupRequestByPublicId(id1)
    await cleanupRequestByPublicId(id2)
  }
})

test('submitRequest: rejects more than the gallery photo cap', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('too-much-gallery', applicant, { galleryPhotos: fakePhotos(21, 'gallery') })
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: an unknown amenity key is rejected', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  const body = serviceBody('bad-amenity', applicant, { amenityKeys: ['wifi', 'not_a_real_amenity'] })
  await assertRejects(groundOwnerRequestService.submitRequest(body))
})

test('submitRequest: amenities are optional — an empty list is accepted', async () => {
  const applicant = { name: 'A', email: 'a@example.test', phone: null }
  let publicRequestId
  try {
    const req = await groundOwnerRequestService.submitRequest(serviceBody('no-amenities', applicant, { amenityKeys: [] }))
    publicRequestId = req.public_request_id
    assert.equal(req.status, 'PENDING')
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
  }
})

test('submitRequest: a valid submission creates a PENDING request with photos/amenities persisted, terms_agreed_at recorded, WITHOUT creating a ground or granting any membership', async () => {
  const submitter = await createUser('valid-submitter')
  const applicant = { name: 'Direct Applicant', email: `direct-${uniqueTag()}@example.test`, phone: null }
  let publicRequestId
  try {
    const req = await groundOwnerRequestService.submitRequest(serviceBody('valid', applicant), submitter.id)
    publicRequestId = req.public_request_id
    assert.equal(req.status, 'PENDING')
    assert.ok(req.terms_agreed_at, 'terms_agreed_at must be recorded at submission time')
    assert.equal(req.submitted_by_user_id, submitter.id)

    const photoRows = (await pool.query('SELECT * FROM ground_registration_photos WHERE request_id = $1', [req.id])).rows
    assert.equal(photoRows.filter((p) => p.is_featured).length, 6)
    const amenityRows = (await pool.query('SELECT amenity_key FROM ground_registration_amenities WHERE request_id = $1', [req.id])).rows
    assert.deepEqual(amenityRows.map((r) => r.amenity_key).sort(), [...AMENITY_KEYS].sort())

    assert.equal((await pool.query('SELECT * FROM grounds WHERE name = $1', [req.ground_name])).rows[0], undefined)
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await submitter.cleanup()
  }
})

// --- HTTP layer: auth guards, real routing -----------------------------

test('POST /grounds: rejects an unauthenticated request', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/grounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validRegistrationBody('noauth')),
    })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner-requests: rejects an unauthenticated request', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests`)
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner-requests: rejects a non-super_admin staff member', async () => {
  const server = await startTestApp()
  const admin = await createUser('non-super', { role: 'staff', staffRoleId: 2 }) // 2 = 'admin', not 'super_admin'
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests`, { headers: authHeader(admin.token) })
    assert.equal(res.status, 403)
  } finally {
    await admin.cleanup()
    await server.close()
  }
})

// Ground Approval MFA removal (2026-08-24) — authorization for approve must
// stay fully enforced even though step-up was intentionally removed from
// this action. These three tests are the direct regression coverage for
// that: role authorization is untouched (unauthenticated / non-super-admin
// still rejected), and a super_admin can approve with NO step-up grant
// minted at all (distinct from the full-flow test above, which happens to
// mint one for other historical reasons and so wouldn't catch a silent
// re-introduction of the requirement).
test('POST /ground-owner-requests/:id/approve: rejects an unauthenticated request', async () => {
  const server = await startTestApp()
  const owner = await createUser('approve-auth-owner')
  let publicRequestId
  try {
    publicRequestId = await createPendingRequest(owner, 'approve-auth')
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST' })
    assert.equal(res.status, 401)
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await owner.cleanup()
    await server.close()
  }
})

test('POST /ground-owner-requests/:id/approve: rejects a non-super_admin staff member', async () => {
  const server = await startTestApp()
  const owner = await createUser('approve-nonadmin-owner')
  const admin = await createUser('approve-nonadmin-admin', { role: 'staff', staffRoleId: 2 }) // 2 = 'admin', not 'super_admin'
  let publicRequestId
  try {
    publicRequestId = await createPendingRequest(owner, 'approve-nonadmin')
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: authHeader(admin.token) })
    assert.equal(res.status, 403)
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await admin.cleanup()
    await owner.cleanup()
    await server.close()
  }
})

test('POST /ground-owner-requests/:id/approve: a super_admin can approve with NO step-up grant at all', async () => {
  const server = await startTestApp()
  const owner = await createUser('approve-no-stepup-owner')
  const superAdmin = await createUser('approve-no-stepup-admin', { role: 'staff', staffRoleId: 1 })
  const { cookie: superAdminCookie } = await mintMfaVerifiedSessionCookie(superAdmin.id)
  let publicRequestId
  try {
    publicRequestId = await createPendingRequest(owner, 'approve-no-stepup')
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cookieHeader(superAdminCookie) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.request.status, 'APPROVED')
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await superAdmin.cleanup()
    await owner.cleanup()
    await server.close()
  }
})

test('GET /ground-owner-requests/status/:publicRequestId: unknown reference id 404s, never enumerable', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/status/GOR-DOESNOTEXIST`)
    assert.equal(res.status, 404)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner-requests/mine: rejects an unauthenticated request', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/mine`)
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

test('GET /ground-owner-requests/amenity-catalog: returns the real, active predefined catalog', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/amenity-catalog`)
    assert.equal(res.status, 200)
    const body = await res.json()
    const keys = body.amenities.map((a) => a.key)
    assert.ok(keys.includes('wifi') && keys.includes('parking') && keys.includes('washroom'))
    assert.ok(body.amenities.every((a) => typeof a.icon === 'string' && a.icon.length > 0), 'every catalog entry must carry a real icon reference')
  } finally {
    await server.close()
  }
})

test('no auth -> 401 on POST /ground-owner-requests/photos', async () => {
  const server = await startTestApp()
  try {
    const res = await fetch(`${server.baseUrl}/ground-owner-requests/photos`, { method: 'POST' })
    assert.equal(res.status, 401)
  } finally {
    await server.close()
  }
})

let cloudinaryUploadWorks = false
try {
  const probe = await uploadImageFileDetailed(
    { buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), originalname: 'preflight.png', mimetype: 'image/png' },
    'ground-registration-test-preflight',
  )
  cloudinaryUploadWorks = true
  await deleteImageByPublicId(probe.publicId)
} catch {
  cloudinaryUploadWorks = false
}

test(
  'POST /ground-owner-requests/photos: a real uploaded file returns a Cloudinary URL, no DB row created yet',
  { skip: !cloudinaryUploadWorks && 'Cloudinary upload is not permitted in this environment — not a regression' },
  async () => {
    const server = await startTestApp()
    const user = await createUser('photo-upload')
    try {
      const onePx = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
      const form = new FormData()
      form.append('photo', new Blob([onePx], { type: 'image/png' }), 'test.png')
      const res = await fetch(`${server.baseUrl}/ground-owner-requests/photos`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body: form })
      assert.equal(res.status, 201)
      const body = await res.json()
      assert.match(body.url, /^https:\/\/res\.cloudinary\.com\//)
      assert.ok(body.publicId)

      const rows = (await pool.query('SELECT * FROM ground_registration_photos WHERE cloudinary_public_id = $1', [body.publicId])).rows
      assert.equal(rows.length, 0, 'no DB row exists until the request itself is submitted')

      await deleteImageByPublicId(body.publicId)
    } finally {
      await user.cleanup()
      await server.close()
    }
  },
)

// --- HTTP layer: the one full submit -> review -> approve/reject flow ------
// Deliberately just ONE real POST /grounds call per test below (not one per
// assertion) to stay well under groundWriteLimiter's 10/10min ceiling
// across this whole file.

test('ground-owner-requests: full flow — submit via HTTP, super_admin sees photos/amenities/terms in the queue, approves, ground becomes public with copied photos/amenities and a real GROUND_OWNER membership', async () => {
  const server = await startTestApp()
  const owner = await createUser('flow-owner')
  const superAdmin = await createUser('flow-admin', { role: 'staff', staffRoleId: 1 }) // 1 = 'super_admin'
  const { cookie: superAdminCookie, sessionId: superAdminSessionId } = await mintMfaVerifiedSessionCookie(superAdmin.id)
  let publicRequestId
  try {
    const createRes = await fetch(`${server.baseUrl}/grounds`, { method: 'POST', headers: authHeader(owner.token), body: JSON.stringify(validRegistrationBody('flow')) })
    assert.equal(createRes.status, 201)
    const createBody = await createRes.json()
    publicRequestId = createBody.request.publicRequestId
    assert.equal(createBody.request.status, 'PENDING')

    const dbRow = (await pool.query('SELECT * FROM ground_owner_requests WHERE public_request_id = $1', [publicRequestId])).rows[0]
    assert.equal(dbRow.applicant_email, owner.email, 'the applicant identity must come from the authenticated session, not the request body')
    assert.equal(dbRow.submitted_by_user_id, owner.id)
    const membershipBefore = (await pool.query('SELECT * FROM ground_users WHERE user_id = $1', [owner.id])).rows[0]
    assert.equal(membershipBefore, undefined, 'no ground_users membership should exist before a super_admin approves the request')

    const pendingRes = await fetch(`${server.baseUrl}/ground-owner-requests`, { headers: cookieHeader(superAdminCookie) })
    assert.equal(pendingRes.status, 200)
    const pendingBody = await pendingRes.json()
    const found = pendingBody.requests.find((r) => r.publicRequestId === publicRequestId)
    assert.ok(found, 'the pending queue must include the freshly submitted request')
    assert.equal(found.photos.filter((p) => p.isFeatured).length, 6)
    assert.deepEqual(found.amenityKeys.sort(), [...AMENITY_KEYS].sort())
    assert.ok(found.termsAgreedAt)

    await mintStepUpGrant(superAdminSessionId, superAdmin.id, 'GROUND_OWNER_REQUEST_APPROVE')
    const approveRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cookieHeader(superAdminCookie) })
    assert.equal(approveRes.status, 200)
    const approveBody = await approveRes.json()
    assert.equal(approveBody.request.status, 'APPROVED')
    assert.equal(approveBody.ground.status, 'ACTIVE')
    const publicGroundId = approveBody.ground.publicGroundId

    const profileRes = await fetch(`${server.baseUrl}/grounds/${publicGroundId}`)
    assert.equal(profileRes.status, 200, 'an ACTIVE ground must now be publicly visible')
    const profile = await profileRes.json()
    assert.equal(profile.photos.filter((p) => p.isFeatured).length, 6, 'the public profile must expose exactly 6 featured photos')
    assert.deepEqual(profile.amenityCatalog.map((a) => a.key).sort(), [...AMENITY_KEYS].sort())
    assert.ok(profile.amenityCatalog.every((a) => a.name && a.icon), 'each public amenity must carry the LOC-controlled name/icon, never anything owner-supplied')

    const dbGround = (await pool.query('SELECT * FROM grounds WHERE public_ground_id = $1', [publicGroundId])).rows[0]
    const membership = (await pool.query('SELECT * FROM ground_users WHERE ground_id = $1 AND user_id = $2', [dbGround.id, owner.id])).rows[0]
    assert.ok(membership, 'approval must grant a real GROUND_OWNER membership for the applicant')
    assert.equal(membership.role, 'GROUND_OWNER')
    assert.equal(membership.is_active, true)

    const auditRow = (await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'GROUND_OWNER_APPROVED' AND target_request_id = $1`, [dbRow.id])).rows[0]
    assert.ok(auditRow, 'approval must write a GROUND_OWNER_APPROVED audit event')

    // "My Ground Registrations" — same owner, HTTP-authenticated.
    const mineRes = await fetch(`${server.baseUrl}/ground-owner-requests/mine`, { headers: authHeader(owner.token) })
    assert.equal(mineRes.status, 200)
    assert.ok((await mineRes.json()).requests.some((r) => r.publicRequestId === publicRequestId))
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('ground-owner-requests: reject requires a reason, sets REJECTED, then Edit & Resubmit — by the real owner only, re-validated, returns to PENDING', async () => {
  const server = await startTestApp()
  const owner = await createUser('reject-resubmit-owner')
  const otherOwner = await createUser('reject-resubmit-other')
  const superAdmin = await createUser('reject-resubmit-admin', { role: 'staff', staffRoleId: 1 })
  const { cookie: superAdminCookie } = await mintMfaVerifiedSessionCookie(superAdmin.id)
  let publicRequestId
  try {
    publicRequestId = await createPendingRequest(owner, 'reject-resubmit')

    // Before any decision, resubmit must be refused.
    const tooEarly = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}`, { method: 'PUT', headers: authHeader(owner.token), body: JSON.stringify(validRegistrationBody('resubmit-early')) })
    assert.equal(tooEarly.status, 409)

    const noReasonRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/reject`, { method: 'POST', headers: cookieHeader(superAdminCookie), body: JSON.stringify({}) })
    assert.equal(noReasonRes.status, 400)

    const rejectRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/reject`, {
      method: 'POST',
      headers: cookieHeader(superAdminCookie),
      body: JSON.stringify({ reason: 'Address could not be verified.' }),
    })
    assert.equal(rejectRes.status, 200)
    assert.equal((await rejectRes.json()).request.status, 'REJECTED')

    const statusRes = await fetch(`${server.baseUrl}/ground-owner-requests/status/${publicRequestId}`)
    const statusBody = await statusRes.json()
    assert.equal(statusBody.request.status, 'REJECTED')
    assert.equal(statusBody.request.rejectionReason, 'Address could not be verified.')
    assert.equal(statusBody.request.reviewedBy, undefined, 'the public status check must never expose reviewed_by')

    // Ownership: another owner may not view or resubmit this request.
    const otherDetail = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/mine`, { headers: authHeader(otherOwner.token) })
    assert.equal(otherDetail.status, 403)
    const otherResubmit = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}`, {
      method: 'PUT',
      headers: authHeader(otherOwner.token),
      body: JSON.stringify(validRegistrationBody('resubmit-wrong-owner')),
    })
    assert.equal(otherResubmit.status, 403)

    // Re-validation on resubmit uses the exact same validateSubmissionFields
    // path as a fresh submission — already covered field-by-field by the
    // direct-service tests above (agreedToTerms/photo-count/amenity-key/
    // etc.), not repeated here via HTTP.

    // The real owner resubmits successfully.
    const ownDetail = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/mine`, { headers: authHeader(owner.token) })
    assert.equal(ownDetail.status, 200)

    const newBody = validRegistrationBody('resubmit-valid', { amenityKeys: ['cctv'] })
    const resubmitRes = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}`, { method: 'PUT', headers: authHeader(owner.token), body: JSON.stringify(newBody) })
    assert.equal(resubmitRes.status, 200)
    const resubmitBody = (await resubmitRes.json()).request
    assert.equal(resubmitBody.status, 'PENDING')
    assert.equal(resubmitBody.rejectionReason, null)
    assert.equal(resubmitBody.groundName, newBody.name)

    const amenityRows = (await pool.query('SELECT amenity_key FROM ground_registration_amenities WHERE request_id = (SELECT id FROM ground_owner_requests WHERE public_request_id = $1)', [publicRequestId])).rows
    assert.deepEqual(amenityRows.map((r) => r.amenity_key), ['cctv'])

    const auditRow = (await pool.query(`SELECT * FROM account_audit_log WHERE event_type = 'GROUND_OWNER_REQUEST_RESUBMITTED' AND target_request_id = (SELECT id FROM ground_owner_requests WHERE public_request_id = $1)`, [publicRequestId])).rows[0]
    assert.ok(auditRow, 'resubmission must write a GROUND_OWNER_REQUEST_RESUBMITTED audit event')
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await owner.cleanup()
    await otherOwner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test('ground-owner-requests: deciding an already-decided request is rejected (no double-approval)', async () => {
  const server = await startTestApp()
  const owner = await createUser('twice-owner')
  const superAdmin = await createUser('twice-admin', { role: 'staff', staffRoleId: 1 })
  const { cookie: superAdminCookie, sessionId: superAdminSessionId } = await mintMfaVerifiedSessionCookie(superAdmin.id)
  let publicRequestId
  try {
    publicRequestId = await createPendingRequest(owner, 'twice')

    await mintStepUpGrant(superAdminSessionId, superAdmin.id, 'GROUND_OWNER_REQUEST_APPROVE')
    const firstDecision = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cookieHeader(superAdminCookie) })
    assert.equal(firstDecision.status, 200)

    // Ground Approval MFA removal (2026-08-24) — approve no longer consumes
    // a step-up grant at all, so minting a second one here would just
    // collide with the still-active first grant on idx_step_up_grants_active
    // (session_id, action_scope) unique-while-unused index. The second
    // decision fails on "already decided" (409 REQUEST_NOT_ELIGIBLE) purely
    // from the request's own status, independent of step-up.
    const secondDecision = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/approve`, { method: 'POST', headers: cookieHeader(superAdminCookie) })
    assert.equal(secondDecision.status, 409, 'a request that is no longer PENDING/UNDER_REVIEW cannot be approved again')

    const rejectAfterApprove = await fetch(`${server.baseUrl}/ground-owner-requests/${publicRequestId}/reject`, {
      method: 'POST',
      headers: cookieHeader(superAdminCookie),
      body: JSON.stringify({ reason: 'too late' }),
    })
    assert.equal(rejectAfterApprove.status, 409)
  } finally {
    await cleanupRequestByPublicId(publicRequestId)
    await owner.cleanup()
    await superAdmin.cleanup()
    await server.close()
  }
})

test("GET /ground-owner-requests/mine: a Ground Owner never sees another owner's registration", async () => {
  const server = await startTestApp()
  const ownerA = await createUser('mine-a')
  const ownerB = await createUser('mine-b')
  const requestIds = []
  try {
    const idA = await createPendingRequest(ownerA, 'mine-a')
    requestIds.push(idA)
    const idB = await createPendingRequest(ownerB, 'mine-b')
    requestIds.push(idB)

    const mineA = await (await fetch(`${server.baseUrl}/ground-owner-requests/mine`, { headers: authHeader(ownerA.token) })).json()
    assert.ok(mineA.requests.some((r) => r.publicRequestId === idA))
    assert.ok(!mineA.requests.some((r) => r.publicRequestId === idB), "owner A must never see owner B's registration")

    const mineB = await (await fetch(`${server.baseUrl}/ground-owner-requests/mine`, { headers: authHeader(ownerB.token) })).json()
    assert.ok(mineB.requests.some((r) => r.publicRequestId === idB))
    assert.ok(!mineB.requests.some((r) => r.publicRequestId === idA))
  } finally {
    for (const id of requestIds) await cleanupRequestByPublicId(id)
    await ownerA.cleanup()
    await ownerB.cleanup()
    await server.close()
  }
})

// --- Contact verification & lookup ------------------------------------
// otpRequestLimiter/otpVerifyLimiter are shared, in-memory, IP-keyed
// limiters used by EVERY OTP endpoint across the whole app — when the full
// suite runs together (npm run test:integration), many other files'
// tests already consume real budget from the same window. Only the
// unauthenticated-rejection check below needs real HTTP (it never reaches
// otp.service.js at all — requireAuth 401s first); everything else calls
// groundContactVerificationService/groundRegistrationLookupService
// directly, same established pattern as the rest of this file.

test('POST /ground-owner-requests/contact-verification/*: rejects unauthenticated requests', async () => {
  const server = await startTestApp()
  try {
    const res1 = await fetch(`${server.baseUrl}/ground-owner-requests/contact-verification/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'x@example.test' }) })
    assert.equal(res1.status, 401)
    const res2 = await fetch(`${server.baseUrl}/ground-owner-requests/contact-verification/verify-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'x@example.test', code: '123456' }) })
    assert.equal(res2.status, 401)
  } finally {
    await server.close()
  }
})

test("groundContactVerificationService: a wrong code never persists the unverified contact value onto the caller's account", async () => {
  const user = await createUser('contact-verify', { withPhone: false })
  const newPhone = `+91${String(Date.now()).slice(-10)}`
  try {
    await groundContactVerificationService.requestContactVerification(user, newPhone)

    const otpRow = (await pool.query(`SELECT id FROM otp_codes WHERE identifier = $1 AND purpose = 'GROUND_CONTACT_VERIFY' ORDER BY created_at DESC LIMIT 1`, [newPhone])).rows[0]
    assert.ok(otpRow, 'a GROUND_CONTACT_VERIFY-purpose OTP row must exist')

    await assert.rejects(() => groundContactVerificationService.verifyContactVerification(user, newPhone, '000000'), OtpAuthError)

    const dbUser = (await pool.query('SELECT phone FROM users WHERE id = $1', [user.id])).rows[0]
    assert.equal(dbUser.phone, null, 'a wrong code must never persist the unverified contact value')
  } finally {
    await user.cleanup()
  }
})

test('groundContactVerificationService.requestContactVerification: refuses an identifier already belonging to a different account', async () => {
  const owner = await createUser('contact-taken-owner', { withEmail: false })
  const existing = await createUser('contact-taken-existing')
  try {
    await assert.rejects(() => groundContactVerificationService.requestContactVerification(owner, existing.email), AccountCreationError)
  } finally {
    await owner.cleanup()
    await existing.cleanup()
  }
})

test('groundRegistrationLookupService.requestLookupCode: does not throw/distinguish whether the identifier has any registrations (anti-enumeration)', async () => {
  await assert.doesNotReject(() => groundRegistrationLookupService.requestLookupCode(`nobody-registered-anything-${uniqueTag()}@example.test`))
})

test('groundRegistrationLookupService.verifyLookupAndList: a wrong code is rejected without listing anything', async () => {
  const identifier = `lookup-wrong-${uniqueTag()}@example.test`
  await groundRegistrationLookupService.requestLookupCode(identifier)
  await assert.rejects(() => groundRegistrationLookupService.verifyLookupAndList(identifier, '000000'), OtpAuthError)
})
