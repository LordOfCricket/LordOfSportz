import { pool } from '../config/db.js'

// SUPER_ADMIN Identity & Secure Provisioning feature — the ONLY sequential
// identifier scheme in this codebase; every other public ID
// (utils/publicId.js#generatePublicId) is deliberately random-suffix. A
// small, curated set of Super Admin accounts (the brief's own framing) is
// exactly the case where a sequential, easy-to-reference-in-support ID
// ("Which Super Admin performed this action?") is more useful than a
// random one — reused as the existing `users.staff_id` column's value
// (that column already exists specifically as a human-facing display ID,
// see its own comment in schema.sql), not a new column.
const PREFIX = 'LOC-ADM-'
const PAD_LENGTH = 3
const MAX_ATTEMPTS = 5

// COUNT-then-format, not a dedicated Postgres SEQUENCE — acceptable here
// because staff_id already has a UNIQUE constraint as the real backstop; a
// collision under concurrent bootstrap/admin-creation (an inherently rare,
// low-frequency, super_admin-gated operation) is simply retried against the
// next number, same shape as ensureUniqueSlug (groundOwnerRequest.service.js)
// and createRequest's public_request_id retry loop elsewhere in this codebase.
export async function generateAdminId(client = pool) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE staff_id LIKE $1`, [`${PREFIX}%`])
    const next = rows[0].count + 1 + attempt
    const candidate = `${PREFIX}${String(next).padStart(PAD_LENGTH, '0')}`
    const { rows: existing } = await client.query('SELECT 1 FROM users WHERE staff_id = $1', [candidate])
    if (existing.length === 0) return candidate
  }
  throw new Error('Could not generate a unique Admin ID.')
}
