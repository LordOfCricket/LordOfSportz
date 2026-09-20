import { pool } from '../config/db.js'

// Phase 12 — ground_id is now NOT NULL (schema.sql), backfilled to the
// single existing ground. Resolved server-side via findSingleGround() at
// the controller layer (mirrors canteen_id's Phase 10 treatment) — never
// client-supplied.
export async function createGroundPhoto({ groundId, title = null, imageUrl, sortOrder = 0, cloudinaryPublicId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO ground_photos (ground_id, title, image_url, sort_order, cloudinary_public_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [groundId, title, imageUrl, sortOrder, cloudinaryPublicId]
  )
  return rows[0]
}

export async function findAllGroundPhotos() {
  const { rows } = await pool.query(
    'SELECT * FROM ground_photos ORDER BY sort_order, created_at'
  )
  return rows
}

// Phase 12 Step 15 — the public ground profile's explicit ground boundary:
// "never SELECT all photos." Explicit column list, no internal id/
// cloudinary_public_id/created_at (Step 2/22 — those aren't part of the
// public contract). is_featured (Ground Registration feature) IS part of
// that contract — it's what lets the public ground page split the exact-6
// slideshow from the gallery.
export async function findGroundPhotosByGroundId(groundId) {
  const { rows } = await pool.query(
    'SELECT title, image_url, sort_order, is_featured FROM ground_photos WHERE ground_id = $1 ORDER BY is_featured DESC, sort_order, created_at',
    [groundId],
  )
  return rows
}

export async function deleteGroundPhoto(id) {
  const { rows } = await pool.query(
    'DELETE FROM ground_photos WHERE id = $1 RETURNING *',
    [id]
  )
  return rows[0] || null
}

// Ground Registration feature — bulk-copies a request's staged photos into
// real, ground-scoped rows at approval time (groundOwnerRequest.service.js
// #approveRequest), preserving is_featured/sort_order exactly. `photos` —
// [{ imageUrl, cloudinaryPublicId, isFeatured, sortOrder }].
export async function insertMany(groundId, photos, client = pool) {
  if (!photos || photos.length === 0) return []
  const values = []
  const params = [groundId]
  photos.forEach((photo) => {
    const base = params.length
    params.push(photo.imageUrl, photo.cloudinaryPublicId, photo.isFeatured, photo.sortOrder)
    values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
  })
  const { rows } = await client.query(
    `INSERT INTO ground_photos (ground_id, image_url, cloudinary_public_id, is_featured, sort_order)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params,
  )
  return rows
}

// Phase 2 — Ground Owner operations scoped to their own grounds.
// All functions verify ground ownership before any operation.

// Fetch all photos for a ground (owner-scoped, returns internal fields)
export async function findPhotosByGroundIdForOwner(groundId) {
  const { rows } = await pool.query(
    `SELECT id, title, image_url, sort_order, is_featured, cloudinary_public_id, created_at
     FROM ground_photos
     WHERE ground_id = $1
     ORDER BY is_featured DESC, sort_order, created_at`,
    [groundId],
  )
  return rows
}

// Find a single photo by id, verify it belongs to the specified ground
export async function findPhotoByIdAndGroundId(photoId, groundId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM ground_photos
     WHERE id = $1 AND ground_id = $2`,
    [photoId, groundId],
  )
  return rows[0] || null
}

// Set one photo as featured (hero), unfeature all others in that ground
export async function setFeaturedPhoto(groundId, photoId, client) {
  const providedClient = client
  const shouldRelease = !providedClient
  if (shouldRelease) client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Verify photo belongs to this ground
    const photo = await client.query(
      'SELECT id FROM ground_photos WHERE id = $1 AND ground_id = $2',
      [photoId, groundId],
    )
    if (photo.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }

    // Unfeature all others
    await client.query(
      `UPDATE ground_photos SET is_featured = false WHERE ground_id = $1 AND id != $2`,
      [groundId, photoId],
    )

    // Feature this one
    const { rows } = await client.query(
      `UPDATE ground_photos SET is_featured = true WHERE id = $1 RETURNING *`,
      [photoId],
    )

    await client.query('COMMIT')
    return rows[0] || null
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    if (shouldRelease) client.release()
  }
}

// Update sort order for multiple photos atomically
export async function updatePhotoSortOrder(groundId, updates, client) {
  // updates: [{ photoId, sortOrder }, ...]
  if (!updates || updates.length === 0) return []

  const providedClient = client
  const shouldRelease = !providedClient
  if (shouldRelease) client = await pool.connect()

  try {
    await client.query('BEGIN')

    const results = []
    for (const { photoId, sortOrder } of updates) {
      // Verify each photo belongs to this ground
      const photo = await client.query(
        'SELECT id FROM ground_photos WHERE id = $1 AND ground_id = $2',
        [photoId, groundId],
      )
      if (photo.rows.length === 0) {
        await client.query('ROLLBACK')
        return null // Partial update not allowed — all or nothing
      }

      const { rows } = await client.query(
        `UPDATE ground_photos SET sort_order = $1 WHERE id = $2 RETURNING *`,
        [sortOrder, photoId],
      )
      results.push(rows[0])
    }

    await client.query('COMMIT')
    return results
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    if (shouldRelease) client.release()
  }
}

// Delete a photo by id, with ground verification
export async function deleteGroundPhotoByOwner(photoId, groundId) {
  const { rows } = await pool.query(
    `DELETE FROM ground_photos WHERE id = $1 AND ground_id = $2 RETURNING *`,
    [photoId, groundId],
  )
  return rows[0] || null
}
