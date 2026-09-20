import { pool } from '../config/db.js'

// Request-scoped amenity selections (Ground Registration feature) — copied
// into ground_amenities (with a real ground_id) on approval, same pattern
// as groundRegistrationPhoto.model.js.

export async function insertMany(requestId, amenityKeys, client = pool) {
  if (!amenityKeys || amenityKeys.length === 0) return []
  const values = amenityKeys.map((_, i) => `($1, $${i + 2})`).join(', ')
  const { rows } = await client.query(
    `INSERT INTO ground_registration_amenities (request_id, amenity_key) VALUES ${values} RETURNING *`,
    [requestId, ...amenityKeys],
  )
  return rows
}

export async function findKeysByRequestId(requestId, client = pool) {
  const { rows } = await client.query('SELECT amenity_key FROM ground_registration_amenities WHERE request_id = $1 ORDER BY amenity_key', [requestId])
  return rows.map((r) => r.amenity_key)
}

export async function deleteByRequestId(requestId, client = pool) {
  await client.query('DELETE FROM ground_registration_amenities WHERE request_id = $1', [requestId])
}
