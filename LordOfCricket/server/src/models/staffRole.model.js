import { pool } from '../config/db.js'

export async function findStaffRoleByName(name) {
  const { rows } = await pool.query('SELECT id, name FROM staff_roles WHERE name = $1', [name])
  return rows[0] || null
}
