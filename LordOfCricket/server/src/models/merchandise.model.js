import { pool } from '../config/db.js'

export const MERCHANDISE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']
export const PUBLIC_MERCHANDISE_STATUSES = ['ACTIVE', 'OUT_OF_STOCK']

// Canonical merchandise categories. Slug is the URL/child-route segment,
// name is what is stored in merchandise.category and shown publicly.
// Adding a category later = one entry here (+ its attribute list in the
// controller); no schema change (attributes live in a JSONB column).
export const MERCHANDISE_CATEGORIES = [
  { slug: 'bats', name: 'Cricket Bats' },
  { slug: 'balls', name: 'Cricket Balls' },
  { slug: 'jerseys', name: 'Cricket Jerseys' },
  { slug: 'shoes', name: 'Cricket Shoes' },
  { slug: 'accessories', name: 'Cricket Accessories' },
  { slug: 'protective-gear', name: 'Protective Gear' },
]
export const MERCHANDISE_CATEGORY_NAMES = MERCHANDISE_CATEGORIES.map((c) => c.name)

const INSERT_COLUMNS = [
  'name',
  'description',
  'category',
  'image_url',
  'cloudinary_public_id',
  'original_price',
  'selling_price',
  'discount_price',
  'stock_quantity',
  'sku',
  'is_featured',
  'status',
  'sort_order',
  'attributes',
]

export async function createMerchandise(fields) {
  const values = INSERT_COLUMNS.map((col) => {
    const v = fields[col]
    if (col === 'attributes') return JSON.stringify(v ?? {})
    return v === undefined ? null : v
  })
  const placeholders = INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await pool.query(
    `INSERT INTO merchandise (${INSERT_COLUMNS.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values,
  )
  return rows[0]
}

export async function findPublicMerchandise() {
  const { rows } = await pool.query(
    `SELECT * FROM merchandise WHERE status = ANY($1) ORDER BY is_featured DESC, sort_order, created_at`,
    [PUBLIC_MERCHANDISE_STATUSES],
  )
  return rows
}

const SORTS = {
  order: 'sort_order ASC, created_at DESC',
  newest: 'created_at DESC',
  oldest: 'created_at ASC',
  name: 'name ASC',
  price_low: 'selling_price ASC',
  price_high: 'selling_price DESC',
  stock: 'stock_quantity ASC',
}

// Admin list with optional category / status filter, free-text search,
// sort and pagination. Returns { rows, total }.
export async function findAllMerchandise({ category, status, q, sort = 'order', limit, offset = 0 } = {}) {
  const where = []
  const params = []
  if (category) {
    params.push(category)
    where.push(`category = $${params.length}`)
  }
  if (status) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`)
    where.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length})`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql = SORTS[sort] || SORTS.order

  const totalRes = await pool.query(`SELECT COUNT(*)::int AS total FROM merchandise ${whereSql}`, params)
  const total = totalRes.rows[0].total

  let limitSql = ''
  if (limit != null) {
    params.push(limit)
    limitSql += ` LIMIT $${params.length}`
    params.push(offset)
    limitSql += ` OFFSET $${params.length}`
  }

  const { rows } = await pool.query(
    `SELECT * FROM merchandise ${whereSql} ORDER BY ${orderSql}${limitSql}`,
    params,
  )
  return { rows, total }
}

export async function findMerchandiseById(id) {
  const { rows } = await pool.query('SELECT * FROM merchandise WHERE id = $1', [id])
  return rows[0] || null
}

export async function updateMerchandise(id, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findMerchandiseById(id)
  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const values = keys.map((key) => (key === 'attributes' ? JSON.stringify(fields[key] ?? {}) : fields[key]))
  const { rows } = await pool.query(
    `UPDATE merchandise SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...values],
  )
  return rows[0] || null
}

export async function deleteMerchandise(id) {
  const { rows } = await pool.query('DELETE FROM merchandise WHERE id = $1 RETURNING *', [id])
  return rows[0] || null
}
