import { pool } from '../config/db.js'

export async function createAdvertisement({ title = null, imageUrl, linkUrl = null, sortOrder = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO advertisements (title, image_url, link_url, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, imageUrl, linkUrl, sortOrder]
  )
  return rows[0]
}

export async function findAllAdvertisements() {
  const { rows } = await pool.query(
    'SELECT * FROM advertisements ORDER BY sort_order, created_at'
  )
  return rows
}

export async function deleteAdvertisement(id) {
  const { rows } = await pool.query(
    'DELETE FROM advertisements WHERE id = $1 RETURNING *',
    [id]
  )
  return rows[0] || null
}
