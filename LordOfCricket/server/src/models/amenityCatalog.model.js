import { pool } from '../config/db.js'

// LOC-controlled catalog a Ground Owner selects from at registration —
// never the owner-uploaded-photo `amenities` table (amenity.model.js),
// which is a separate, untouched legacy mechanism for already-approved
// grounds. See schema.sql's amenity_catalog comment for the full framing.

export async function findAllActive() {
  const { rows } = await pool.query('SELECT key, name, icon FROM amenity_catalog WHERE is_active = true ORDER BY display_order')
  return rows
}

// Server-side membership check for a client-supplied list of keys —
// never trust that a submitted amenityKeys array only contains real,
// active catalog keys.
export async function findActiveKeys(keys, client = pool) {
  if (!keys || keys.length === 0) return []
  const { rows } = await client.query('SELECT key FROM amenity_catalog WHERE key = ANY($1::varchar[]) AND is_active = true', [keys])
  return rows.map((r) => r.key)
}

// Amenities Master (Super Admin CMS) — admin-facing: every entry, active or
// not, so a deactivated one can still be found and reactivated.
export async function findAll() {
  const { rows } = await pool.query('SELECT * FROM amenity_catalog ORDER BY display_order')
  return rows
}

export async function findByKey(key) {
  const { rows } = await pool.query('SELECT * FROM amenity_catalog WHERE key = $1', [key])
  return rows[0] || null
}

export async function createAmenity({ key, name, icon, displayOrder = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO amenity_catalog (key, name, icon, display_order) VALUES ($1, $2, $3, $4) RETURNING *`,
    [key, name, icon, displayOrder],
  )
  return rows[0]
}

// Generic column-map UPDATE, mirroring partner.model.js#updatePartner /
// user.model.js#updateUser. amenity_catalog has no updated_at column (it
// never has — this mirrors the existing table shape rather than adding one).
export async function updateAmenity(key, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findByKey(key)
  const setClause = keys.map((col, i) => `${col} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE amenity_catalog SET ${setClause} WHERE key = $1 RETURNING *`,
    [key, ...keys.map((col) => fields[col])],
  )
  return rows[0] || null
}

// Callers must catch the FK-violation (23503) themselves if this key is
// still referenced by ground_amenities/ground_registration_amenities — see
// adminAmenityCatalog.controller.js. Deliberately no pre-check query here
// (a check-then-delete has a race; letting the FK constraint be the real
// guarantee matches this codebase's existing posture elsewhere).
export async function deleteAmenity(key) {
  const { rows } = await pool.query('DELETE FROM amenity_catalog WHERE key = $1 RETURNING *', [key])
  return rows[0] || null
}
