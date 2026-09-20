import { findByGroundId as findAmenitiesByGroundId, insertMany as insertAmenities } from '../models/groundAmenity.model.js'
import { findAllActive as findActiveCatalogAmenities } from '../models/amenityCatalog.model.js'
import { pool } from '../config/db.js'

// Phase 3 — Ground Owner amenity management. req.ground is resolved +
// authorized by requireGroundRole('GROUND_OWNER') before these ever run.
// req.params.publicGroundId is used ONLY to look up which ground; all
// authorization comes from req.ground.id (already verified owned by req.user).

export async function listGroundAmenities(req, res, next) {
  try {
    const amenities = await findAmenitiesByGroundId(req.ground.id)
    res.json({ amenities })
  } catch (err) {
    next(err)
  }
}

export async function addGroundAmenity(req, res, next) {
  try {
    const { amenityKey } = req.body

    if (!amenityKey) {
      return res.status(400).json({ error: 'amenityKey is required.' })
    }

    // Verify the amenity exists in the active catalog
    const catalog = await findActiveCatalogAmenities()
    const catalogEntry = catalog.find(a => a.key === amenityKey)
    if (!catalogEntry) {
      return res.status(400).json({ error: 'amenityKey not found in active catalog.' })
    }

    // Check if already assigned (composite PK will enforce this, but check early for better UX)
    const existing = await pool.query(
      `SELECT 1 FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2`,
      [req.ground.id, amenityKey]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This amenity is already assigned to your ground.' })
    }

    // Insert the assignment
    const { rows } = await pool.query(
      `INSERT INTO ground_amenities (ground_id, amenity_key) VALUES ($1, $2) RETURNING ground_id, amenity_key`,
      [req.ground.id, amenityKey]
    )

    // Return the updated full amenities list
    const amenities = await findAmenitiesByGroundId(req.ground.id)
    res.status(201).json({ amenities })
  } catch (err) {
    // Handle composite PK violation (duplicate assignment)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This amenity is already assigned to your ground.' })
    }
    next(err)
  }
}

export async function removeGroundAmenity(req, res, next) {
  try {
    const amenityKey = req.params.amenityKey

    if (!amenityKey) {
      return res.status(400).json({ error: 'amenityKey is required.' })
    }

    // Verify it's assigned to this ground before removing (IDOR protection)
    const existing = await pool.query(
      `SELECT 1 FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2`,
      [req.ground.id, amenityKey]
    )
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Amenity not found.' })
    }

    // Remove the assignment
    await pool.query(
      `DELETE FROM ground_amenities WHERE ground_id = $1 AND amenity_key = $2`,
      [req.ground.id, amenityKey]
    )

    // Return the updated full amenities list
    const amenities = await findAmenitiesByGroundId(req.ground.id)
    res.json({ amenities })
  } catch (err) {
    next(err)
  }
}
