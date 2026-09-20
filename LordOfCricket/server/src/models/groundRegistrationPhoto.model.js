import { pool } from '../config/db.js'

// Request-scoped photos (Ground Registration feature) — exist only until
// the request is decided; copied into ground_photos (with a real ground_id)
// on approval, see groundOwnerRequest.service.js#approveRequest. CASCADE
// delete on the request means these never need explicit cleanup on their
// own.

// `photos` — [{ url, publicId, isFeatured }], already in the order the
// featured slideshow/gallery should render in (slot 1..6 for featured,
// then gallery order) — sort_order is just that array index.
export async function insertMany(requestId, photos, client = pool) {
  if (!photos || photos.length === 0) return []
  const values = []
  const params = [requestId]
  photos.forEach((photo, i) => {
    const base = params.length
    params.push(photo.url, photo.publicId, photo.isFeatured, i)
    values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
  })
  const { rows } = await client.query(
    `INSERT INTO ground_registration_photos (request_id, image_url, cloudinary_public_id, is_featured, sort_order)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params,
  )
  return rows
}

export async function findByRequestId(requestId, client = pool) {
  const { rows } = await client.query(
    'SELECT id, image_url, cloudinary_public_id, is_featured, sort_order FROM ground_registration_photos WHERE request_id = $1 ORDER BY is_featured DESC, sort_order',
    [requestId],
  )
  return rows
}

// Resubmit replaces the whole photo set rather than diffing it — the
// wizard always re-sends the complete current set (6 featured + gallery),
// same "whole-object replace" shape PATCH /me/player uses for simpler
// fields, just applied to a child table here.
export async function deleteByRequestId(requestId, client = pool) {
  await client.query('DELETE FROM ground_registration_photos WHERE request_id = $1', [requestId])
}
