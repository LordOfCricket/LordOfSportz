import { pool } from '../config/db.js'

// Phase 12 — ground_id is now NOT NULL (schema.sql), backfilled to the
// single existing ground. Resolved server-side via findSingleGround() at
// the controller layer (mirrors canteen_id's Phase 10 treatment) — never
// client-supplied.
export async function createAmenity({ groundId, name, imageUrl, sortOrder = 0, cloudinaryPublicId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO amenities (ground_id, name, image_url, sort_order, cloudinary_public_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [groundId, name, imageUrl, sortOrder, cloudinaryPublicId]
  )
  return rows[0]
}

export async function findAllAmenities() {
  const { rows } = await pool.query(
    'SELECT * FROM amenities ORDER BY sort_order, created_at'
  )
  return rows
}

// Phase 12 Step 16 — the public ground profile's explicit ground boundary.
// Explicit column list, no internal id/cloudinary_public_id/created_at.
export async function findAmenitiesByGroundId(groundId) {
  const { rows } = await pool.query(
    'SELECT name, image_url, sort_order FROM amenities WHERE ground_id = $1 ORDER BY sort_order, created_at',
    [groundId],
  )
  return rows
}

export async function deleteAmenity(id) {
  const { rows } = await pool.query(
    'DELETE FROM amenities WHERE id = $1 RETURNING *',
    [id]
  )
  return rows[0] || null
}
