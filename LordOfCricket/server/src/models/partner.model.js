import { pool } from '../config/db.js'

export async function createPartner({ name, logoUrl, websiteUrl = null, description = null, sortOrder = 0, cloudinaryPublicId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO partners (name, logo_url, website_url, description, sort_order, cloudinary_public_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, logoUrl, websiteUrl, description, sortOrder, cloudinaryPublicId]
  )
  return rows[0]
}

// Public-facing (SponsorsSection.jsx) — only sponsors marked visible.
export async function findActivePartners() {
  const { rows } = await pool.query('SELECT * FROM partners WHERE is_active = true ORDER BY sort_order, created_at')
  return rows
}

// Admin-facing (Sponsors management page) — every sponsor, active or not,
// so a deactivated one can still be found and reactivated.
export async function findAllPartners() {
  const { rows } = await pool.query('SELECT * FROM partners ORDER BY sort_order, created_at')
  return rows
}

export async function findPartnerById(id) {
  const { rows } = await pool.query('SELECT * FROM partners WHERE id = $1', [id])
  return rows[0] || null
}

// Generic column-map UPDATE, mirroring user.model.js#updateUser — bumps
// updated_at automatically so no caller has to remember to.
export async function updatePartner(id, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findPartnerById(id)
  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE partners SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

export async function deletePartner(id) {
  const { rows } = await pool.query('DELETE FROM partners WHERE id = $1 RETURNING *', [id])
  return rows[0] || null
}
