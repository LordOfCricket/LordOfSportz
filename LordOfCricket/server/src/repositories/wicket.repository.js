import { pool } from '../config/db.js'

export async function insertWicket(client, deliveryId, wicket) {
  const { rows } = await client.query(
    `INSERT INTO wickets (delivery_id, dismissal_type, dismissed_match_player_id, fielder_match_player_id, secondary_fielder_match_player_id, is_direct_hit, runs_completed, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      deliveryId,
      wicket.type,
      // dismissedMatchPlayerId is authoritative-input only for run-out; for every
      // other type this gets overwritten right after replay (see updateWicketDismissedPlayer).
      wicket.dismissedMatchPlayerId ?? null,
      wicket.fielderMatchPlayerId ?? null,
      wicket.secondaryFielderMatchPlayerId ?? null,
      wicket.isDirectHit ?? null,
      wicket.runsCompleted ?? null,
      wicket.metadata ?? {},
    ]
  )
  return rows[0]
}

export async function updateWicketDismissedPlayer(client, deliveryId, dismissedMatchPlayerId) {
  const { rows } = await client.query(
    'UPDATE wickets SET dismissed_match_player_id = $2, updated_at = NOW() WHERE delivery_id = $1 RETURNING *',
    [deliveryId, dismissedMatchPlayerId]
  )
  return rows[0]
}

export async function deleteWicketByDelivery(client, deliveryId) {
  await client.query('DELETE FROM wickets WHERE delivery_id = $1', [deliveryId])
}

export async function findWicketByDelivery(deliveryId) {
  const { rows } = await pool.query('SELECT * FROM wickets WHERE delivery_id = $1', [deliveryId])
  return rows[0] || null
}
