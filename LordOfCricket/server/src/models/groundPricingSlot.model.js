import { pool } from '../config/db.js'

// Ground Time-Slot Pricing — CRUD, mirroring amenityCatalog.model.js's own
// shape (plain findAll/findByKey/create/generic-column-map-update/delete).
// Deletion relies on ground_bookings.pricing_slot_id's own ON DELETE SET
// NULL (a historical booking's amount is independently snapshotted, never
// re-read from this table) as the real "safe to delete" guarantee — same
// posture amenityCatalog.model.js#deleteAmenity's own comment documents for
// FK-violation cases: the constraint is the guarantee, not a pre-check here.

export async function findAllByGround(groundId) {
  const { rows } = await pool.query('SELECT * FROM ground_pricing_slots WHERE ground_id = $1 ORDER BY start_time', [groundId])
  return rows
}

export async function findActiveByGround(groundId) {
  const { rows } = await pool.query(
    'SELECT * FROM ground_pricing_slots WHERE ground_id = $1 AND is_active = true ORDER BY start_time',
    [groundId],
  )
  return rows
}

export async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM ground_pricing_slots WHERE id = $1', [id])
  return rows[0] || null
}

export async function createSlot({ groundId, startTime, endTime, price }) {
  const { rows } = await pool.query(
    `INSERT INTO ground_pricing_slots (ground_id, start_time, end_time, price) VALUES ($1, $2, $3, $4) RETURNING *`,
    [groundId, startTime, endTime, price],
  )
  return rows[0]
}

// Generic column-map UPDATE, same convention as amenityCatalog.model.js#
// updateAmenity / partner.model.js#updatePartner. Always bumps updated_at —
// every caller (edit, activate/deactivate) is a real change, never a no-op
// read-back.
export async function updateSlot(id, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findById(id)
  const setClause = keys.map((col, i) => `${col} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE ground_pricing_slots SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...keys.map((col) => fields[col])],
  )
  return rows[0] || null
}

export async function deleteSlot(id) {
  const { rows } = await pool.query('DELETE FROM ground_pricing_slots WHERE id = $1 RETURNING *', [id])
  return rows[0] || null
}
