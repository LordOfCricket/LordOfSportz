import { pool } from '../config/db.js'

export async function insertShot(client, deliveryId, shot) {
  const { rows } = await client.query(
    `INSERT INTO wagon_wheel_shots (delivery_id, normalized_x, normalized_y, angle_degrees, region_id, shot_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [deliveryId, shot.normalizedX, shot.normalizedY, shot.angleDegrees, shot.regionId, shot.shotType ?? null]
  )
  return rows[0]
}

export async function deleteShotByDelivery(client, deliveryId) {
  await client.query('DELETE FROM wagon_wheel_shots WHERE delivery_id = $1', [deliveryId])
}

export async function listShotsByInnings(inningsId) {
  const { rows } = await pool.query(
    `SELECT ws.*, d.striker_match_player_id, d.total_runs, d.log_sequence
     FROM wagon_wheel_shots ws
     JOIN deliveries d ON d.id = ws.delivery_id
     WHERE d.innings_id = $1
     ORDER BY d.log_sequence`,
    [inningsId]
  )
  return rows
}
