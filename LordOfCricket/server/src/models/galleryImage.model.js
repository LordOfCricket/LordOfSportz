import { pool } from '../config/db.js'

// MongoDB cleanup, Phase 1 — GalleryImage's storage layer, migrated from
// Mongoose to plain parameterized SQL. Same role/shape as
// groundPhoto.model.js / amenity.model.js / partner.model.js (Cloudinary
// URL + metadata in Postgres, image bytes stay in Cloudinary). The retired
// Mongoose model (galleryImageMongoLegacy.model.js) is kept only for the
// one-time data migration script and rollback reference — nothing else in
// the live app should import it.
export const GALLERY_CATEGORIES = ['ground', 'match', 'tournament', 'event']

// Maps the service layer's camelCase patch field names to their PostgreSQL
// columns, for both the request-facing update path and the query below —
// one place defines "what's patchable," matching how the retired Mongoose
// model made every field first-class instead of hand-rolling a second list.
const PATCHABLE_COLUMNS = {
  title: 'title',
  description: 'description',
  category: 'category',
  order: 'sort_order',
  isActive: 'is_active',
}

export async function insertGalleryImage({
  title,
  description = '',
  category,
  imageUrl,
  cloudinaryPublicId,
  imageWidth = null,
  imageHeight = null,
  imageFormat = null,
  imageBytes = null,
  sortOrder = 0,
  isActive = true,
  createdBy = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO gallery_images
       (title, description, category, image_url, cloudinary_public_id,
        image_width, image_height, image_format, image_bytes, sort_order,
        is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      title,
      description,
      category,
      imageUrl,
      cloudinaryPublicId,
      imageWidth,
      imageHeight,
      imageFormat,
      imageBytes,
      sortOrder,
      isActive,
      createdBy,
    ],
  )
  return rows[0]
}

export async function findGalleryImages({ category, activeOnly = true } = {}) {
  const conditions = []
  const values = []
  if (category) {
    values.push(category)
    conditions.push(`category = $${values.length}`)
  }
  if (activeOnly) conditions.push('is_active = true')

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await pool.query(
    `SELECT * FROM gallery_images ${where} ORDER BY sort_order ASC, created_at ASC`,
    values,
  )
  return rows
}

export async function findGalleryImageById(id) {
  const { rows } = await pool.query('SELECT * FROM gallery_images WHERE id = $1', [id])
  return rows[0] || null
}

export async function updateGalleryImageById(id, updates) {
  const setParts = []
  const values = []
  for (const [field, column] of Object.entries(PATCHABLE_COLUMNS)) {
    if (updates[field] === undefined) continue
    values.push(updates[field])
    setParts.push(`${column} = $${values.length}`)
  }
  if (setParts.length === 0) return findGalleryImageById(id)

  values.push(id)
  const { rows } = await pool.query(
    `UPDATE gallery_images SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
    values,
  )
  return rows[0] || null
}

export async function deleteGalleryImageById(id) {
  const { rows } = await pool.query('DELETE FROM gallery_images WHERE id = $1 RETURNING *', [id])
  return rows[0] || null
}

// Idempotent upsert keyed on the ORIGINAL MongoDB `_id` — used only by the
// one-time Phase 1 data migration script
// (scripts/migrateGalleryToPostgres.js), never by the live request path.
// `(xmax = 0) AS inserted` is the standard Postgres idiom for telling an
// `ON CONFLICT ... DO UPDATE`'s INSERT branch apart from its UPDATE branch
// in the same round trip, which is what lets the migration script report
// accurate inserted-vs-updated counts without a separate SELECT first.
export async function upsertGalleryImageByLegacyMongoId(fields) {
  const { rows } = await pool.query(
    `INSERT INTO gallery_images
       (title, description, category, image_url, cloudinary_public_id,
        image_width, image_height, image_format, image_bytes, sort_order,
        is_active, created_by, legacy_mongo_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (legacy_mongo_id) WHERE legacy_mongo_id IS NOT NULL DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       image_url = EXCLUDED.image_url,
       cloudinary_public_id = EXCLUDED.cloudinary_public_id,
       image_width = EXCLUDED.image_width,
       image_height = EXCLUDED.image_height,
       image_format = EXCLUDED.image_format,
       image_bytes = EXCLUDED.image_bytes,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       created_by = EXCLUDED.created_by,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      fields.title,
      fields.description,
      fields.category,
      fields.imageUrl,
      fields.cloudinaryPublicId,
      fields.imageWidth,
      fields.imageHeight,
      fields.imageFormat,
      fields.imageBytes,
      fields.sortOrder,
      fields.isActive,
      fields.createdBy,
      fields.legacyMongoId,
      fields.createdAt,
      fields.updatedAt,
    ],
  )
  return rows[0]
}
