import { pool } from '../config/db.js'

// MongoDB cleanup, Phase 3 — MenuItem's storage layer, migrated from
// Mongoose to plain parameterized SQL. TodayMenu and Order stay on
// MongoDB this phase — this file has zero knowledge of either; the
// controller layer is the only place that coordinates across both stores.
// The retired Mongoose model (canteenMenuItemMongoLegacy.model.js) is kept
// only for the one-time data migration script and rollback reference.
//
// Phase 10 — every live read/write function below is now canteen-scoped
// (Step 3/27): update/deactivate include `AND canteen_id = $N` directly in
// the WHERE clause, not a separate "fetch then check" step, so a request
// for a real item id belonging to a DIFFERENT canteen affects zero rows —
// indistinguishable from "id does not exist" (matches the existing 404
// convention, and avoids confirming cross-tenant ids are valid).

const UPDATABLE_COLUMNS = {
  name: 'name',
  category: 'category',
  description: 'description',
  price: 'price',
  imageUrl: 'image_url',
  cloudinaryPublicId: 'cloudinary_public_id',
  defaultStock: 'default_stock',
  isActive: 'is_active',
}

export async function insertMenuItem({
  canteenId,
  name,
  category,
  description = '',
  price,
  imageUrl = '',
  cloudinaryPublicId = '',
  defaultStock = 0,
}) {
  const { rows } = await pool.query(
    `INSERT INTO menu_items (canteen_id, name, category, description, price, image_url, cloudinary_public_id, default_stock)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [canteenId, name, category, description, price, imageUrl, cloudinaryPublicId, defaultStock],
  )
  return rows[0]
}

// "Active items" — the public menu / master menu listing query.
export async function findActiveMenuItemsByCanteenId(canteenId) {
  const { rows } = await pool.query('SELECT * FROM menu_items WHERE canteen_id = $1 AND is_active = true ORDER BY id', [canteenId])
  return rows
}

// ALL items regardless of is_active — matches the retired Mongoose code's
// own `MenuItem.find().lean()` (no filter) used only to validate which ids
// `updateTodaysMenu` is allowed to reference. Deliberately a separate
// function from findActiveMenuItemsByCanteenId, not a parameter, so each
// call site's intent stays obvious at the call site.
export async function findAllMenuItemsByCanteenId(canteenId) {
  const { rows } = await pool.query('SELECT * FROM menu_items WHERE canteen_id = $1 ORDER BY id', [canteenId])
  return rows
}

export async function findMenuItemById(id) {
  const { rows } = await pool.query('SELECT * FROM menu_items WHERE id = $1', [id])
  return rows[0] || null
}

export async function updateMenuItemById(id, canteenId, updates) {
  const setParts = []
  const values = []
  for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (updates[field] === undefined) continue
    values.push(updates[field])
    setParts.push(`${column} = $${values.length}`)
  }
  if (setParts.length === 0) {
    const { rows } = await pool.query('SELECT * FROM menu_items WHERE id = $1 AND canteen_id = $2', [id, canteenId])
    return rows[0] || null
  }

  values.push(id, canteenId)
  const { rows } = await pool.query(
    `UPDATE menu_items SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND canteen_id = $${values.length} RETURNING *`,
    values,
  )
  return rows[0] || null
}

export async function deactivateMenuItemById(id, canteenId) {
  const { rows } = await pool.query(
    `UPDATE menu_items SET is_active = false, updated_at = NOW() WHERE id = $1 AND canteen_id = $2 RETURNING *`,
    [id, canteenId],
  )
  return rows[0] || null
}

// Idempotent upsert keyed on the ORIGINAL MongoDB `_id` — used only by the
// one-time Phase 3 data migration script
// (scripts/migrateMenuItemsToPostgres.js), never by the live request path.
// Phase 10: canteenId defaults to the single existing canteen — this
// migration predates multi-ground entirely, so every row it ever produces
// belongs to the one canteen that existed at Phase 3/migration time.
export async function upsertMenuItemByLegacyMongoId(fields) {
  const { rows } = await pool.query(
    `INSERT INTO menu_items
       (canteen_id, name, category, description, price, image_url, cloudinary_public_id,
        default_stock, is_active, legacy_mongo_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (legacy_mongo_id) WHERE legacy_mongo_id IS NOT NULL DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       image_url = EXCLUDED.image_url,
       cloudinary_public_id = EXCLUDED.cloudinary_public_id,
       default_stock = EXCLUDED.default_stock,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [
      fields.canteenId,
      fields.name,
      fields.category,
      fields.description,
      fields.price,
      fields.imageUrl,
      fields.cloudinaryPublicId,
      fields.defaultStock,
      fields.isActive,
      fields.legacyMongoId,
      fields.createdAt,
      fields.updatedAt,
    ],
  )
  return rows[0]
}
