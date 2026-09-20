import { pool } from '../config/db.js'

export async function createTeam({ name, shortName, logoUrl = null, ownerId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO teams (name, short_name, logo_url, owner_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, shortName, logoUrl, ownerId]
  )
  return rows[0]
}

export async function findTeamById(id) {
  const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [id])
  return rows[0] || null
}

export async function findAllTeams() {
  const { rows } = await pool.query('SELECT * FROM teams ORDER BY id')
  return rows
}

export async function updateTeam(id, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return findTeamById(id)

  const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE teams SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

export async function deleteTeam(id) {
  await pool.query('DELETE FROM teams WHERE id = $1', [id])
}
