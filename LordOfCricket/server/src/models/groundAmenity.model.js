import { pool } from '../config/db.js'

// Ground-scoped catalog selections (Ground Registration feature) — the
// approved-ground counterpart of ground_registration_amenities, populated
// once at approval (groundOwnerRequest.service.js#approveRequest). Public
// ground profile reads this joined to amenity_catalog for name/icon — see
// ground.controller.js#getGroundProfile's `amenityCatalog` field. Entirely
// separate from the legacy, owner-uploaded-photo `amenities` table, which
// this does not touch.

export async function insertMany(groundId, amenityKeys, client = pool) {
  if (!amenityKeys || amenityKeys.length === 0) return []
  const values = amenityKeys.map((_, i) => `($1, $${i + 2})`).join(', ')
  const { rows } = await client.query(`INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ${values} RETURNING *`, [groundId, ...amenityKeys])
  return rows
}

// Public-safe: name + icon only, ordered by the catalog's own display_order.
export async function findByGroundId(groundId, client = pool) {
  const { rows } = await client.query(
    `SELECT ac.key, ac.name, ac.icon
     FROM ground_amenities ga
     JOIN amenity_catalog ac ON ac.key = ga.amenity_key
     WHERE ga.ground_id = $1
     ORDER BY ac.display_order`,
    [groundId],
  )
  return rows
}
