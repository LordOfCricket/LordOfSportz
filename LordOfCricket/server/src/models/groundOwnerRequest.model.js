import { pool } from '../config/db.js'

// Phase 4 — raw SQL, not Prisma, despite being a brand-new table (a
// deliberate deviation from the Phase 2A/3 "new table -> Prisma" default).
// The approval flow (services/groundOwnerRequest.service.js#approveRequest)
// must atomically update this table AND create rows in users/grounds/
// ground_users/account_audit_log in the SAME Postgres transaction — Prisma
// and the `pg` Pool are separate connections, so genuine cross-table
// atomicity requires one client throughout. Consistency (one access
// pattern for this table, not two) won out over the general convention.
// Every function accepts an optional trailing transaction client, same
// pattern as ground.model.js/groundUser.model.js/user.model.js.

const COLUMNS = `id, public_request_id, applicant_name, applicant_email, applicant_phone,
  ground_name, ground_description, address_line, city, state, country, postal_code,
  latitude, longitude, ground_phone, ground_email, ground_website,
  status, rejection_reason, more_info_notes, reviewed_at, reviewed_by, created_ground_id,
  submitted_by_user_id, terms_agreed_at, created_at, updated_at`

// Ground Registration feature — submittedByUserId/termsAgreedAt are the two
// new columns (see schema.sql's comment on them). submittedByUserId stays
// null for the fully-anonymous POST /ground-owner-requests path, which has
// no session to attribute to.
export async function createRequest({
  publicRequestId, applicantName, applicantEmail, applicantPhone,
  groundName, groundDescription, addressLine, city, state, country = 'India', postalCode,
  latitude, longitude, groundPhone, groundEmail, groundWebsite,
  submittedByUserId = null, termsAgreedAt,
}, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO ground_owner_requests
       (public_request_id, applicant_name, applicant_email, applicant_phone,
        ground_name, ground_description, address_line, city, state, country, postal_code,
        latitude, longitude, ground_phone, ground_email, ground_website,
        submitted_by_user_id, terms_agreed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING ${COLUMNS}`,
    [publicRequestId, applicantName, applicantEmail, applicantPhone,
      groundName, groundDescription, addressLine, city, state, country, postalCode,
      latitude, longitude, groundPhone, groundEmail, groundWebsite,
      submittedByUserId, termsAgreedAt],
  )
  return rows[0]
}

// "My Ground Registrations" — every request this authenticated user
// themselves submitted, keyed by submitted_by_user_id (not applicant_email/
// applicant_phone string matching — see schema.sql's comment on why).
export async function findByUserId(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM ground_owner_requests WHERE submitted_by_user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  return rows
}

// Resubmit (Edit & Resubmit after REJECTED/MORE_INFORMATION_REQUIRED) —
// same concurrency-guarded-UPDATE shape as markApprovedIfEligible/
// markRejected/markMoreInfoRequested: the WHERE clause only matches a
// request still in a decided-but-editable state, so a resubmit racing a
// fresh super_admin decision can't silently clobber it. Clears the
// previous decision's reason/notes/reviewer — a resubmission is a genuinely
// new PENDING request, not a continuation of the old review.
export async function markResubmitted(publicRequestId, fields, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_owner_requests SET
       ground_name = $2, ground_description = $3, address_line = $4, city = $5, state = $6,
       country = $7, postal_code = $8, latitude = $9, longitude = $10,
       ground_phone = $11, ground_email = $12, ground_website = $13,
       terms_agreed_at = $14,
       status = 'PENDING', rejection_reason = NULL, more_info_notes = NULL,
       reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
     WHERE public_request_id = $1 AND status IN ('REJECTED', 'MORE_INFORMATION_REQUIRED')
     RETURNING ${COLUMNS}`,
    [
      publicRequestId, fields.groundName, fields.groundDescription, fields.addressLine, fields.city, fields.state,
      fields.country, fields.postalCode, fields.latitude, fields.longitude,
      fields.groundPhone, fields.groundEmail, fields.groundWebsite, fields.termsAgreedAt,
    ],
  )
  return rows[0] || null
}

export async function findByPublicRequestId(publicRequestId, client = pool) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ground_owner_requests WHERE public_request_id = $1`, [publicRequestId])
  return rows[0] || null
}

// Non-logged-in "find my registrations" lookup (OTP-gated at the service
// layer, see groundRegistrationLookup.service.js) — matches the identifier
// the applicant actually typed at submission time, independent of any
// account (an anonymous submitter has no submitted_by_user_id at all).
export async function findByApplicantEmail(email, client = pool) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ground_owner_requests WHERE applicant_email = $1 ORDER BY created_at DESC`, [email])
  return rows
}

export async function findByApplicantPhone(phone, client = pool) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ground_owner_requests WHERE applicant_phone = $1 ORDER BY created_at DESC`, [phone])
  return rows
}

export async function listByStatus(status, client = pool) {
  const { rows } = status
    ? await client.query(`SELECT ${COLUMNS} FROM ground_owner_requests WHERE status = $1 ORDER BY created_at DESC`, [status])
    : await client.query(`SELECT ${COLUMNS} FROM ground_owner_requests ORDER BY created_at DESC`)
  return rows
}

export async function markUnderReview(publicRequestId, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_owner_requests SET status = 'UNDER_REVIEW', updated_at = NOW()
     WHERE public_request_id = $1 AND status = 'PENDING'
     RETURNING ${COLUMNS}`,
    [publicRequestId],
  )
  return rows[0] || null
}

// The concurrency/idempotency guarantee (brief §22): the WHERE clause's own
// status check means a double-click or two simultaneous approve requests
// can only ever have ONE of them actually match a row — the second attempt
// affects zero rows and this returns null, which the service treats as
// "already decided" rather than silently re-running the whole approval.
// This is checked by the database itself, inside the transaction, not by a
// separate SELECT-then-UPDATE in application code (which would race).
export async function markApprovedIfEligible(publicRequestId, { reviewedBy, createdGroundId }, client) {
  const { rows } = await client.query(
    `UPDATE ground_owner_requests
     SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = $2, created_ground_id = $3, updated_at = NOW()
     WHERE public_request_id = $1 AND status IN ('PENDING', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED')
     RETURNING ${COLUMNS}`,
    [publicRequestId, reviewedBy, createdGroundId],
  )
  return rows[0] || null
}

export async function markRejected(publicRequestId, { reviewedBy, reason }, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_owner_requests
     SET status = 'REJECTED', reviewed_at = NOW(), reviewed_by = $2, rejection_reason = $3, updated_at = NOW()
     WHERE public_request_id = $1 AND status IN ('PENDING', 'UNDER_REVIEW', 'MORE_INFORMATION_REQUIRED')
     RETURNING ${COLUMNS}`,
    [publicRequestId, reviewedBy, reason],
  )
  return rows[0] || null
}

export async function markMoreInfoRequested(publicRequestId, { reviewedBy, notes }, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_owner_requests
     SET status = 'MORE_INFORMATION_REQUIRED', reviewed_at = NOW(), reviewed_by = $2, more_info_notes = $3, updated_at = NOW()
     WHERE public_request_id = $1 AND status IN ('PENDING', 'UNDER_REVIEW')
     RETURNING ${COLUMNS}`,
    [publicRequestId, reviewedBy, notes],
  )
  return rows[0] || null
}
