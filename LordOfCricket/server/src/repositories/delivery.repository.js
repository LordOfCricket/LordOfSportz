import { pool } from '../config/db.js'

function rowToReplayEntry(row) {
  return {
    kind: 'delivery',
    id: String(row.id),
    logSequence: row.log_sequence,
    isDeadBall: row.is_dead_ball,
    batRuns: row.bat_runs,
    illegal: row.illegal_type ? { type: row.illegal_type, runs: row.illegal_runs } : null,
    extra: row.extra_type ? { type: row.extra_type, runs: row.extra_runs } : null,
    wicket: row.wicket_dismissal_type
      ? {
          type: row.wicket_dismissal_type,
          dismissedMatchPlayerId: row.wicket_dismissed_match_player_id,
          fielderMatchPlayerId: row.wicket_fielder_match_player_id,
          secondaryFielderMatchPlayerId: row.wicket_secondary_fielder_match_player_id,
          isDirectHit: row.wicket_is_direct_hit,
          runsCompleted: row.wicket_runs_completed,
        }
      : null,
    swapStrikerNonStriker: row.swap_striker_non_striker,
    bowlerMatchPlayerId: row.bowler_match_player_id,
    voided: row.voided,
  }
}

/** Everything replayInnings() needs to fold this innings' deliveries, ordered by log_sequence. */
export async function listDeliveriesForReplay(inningsId, client = pool) {
  const { rows } = await client.query(
    `SELECT d.id, d.log_sequence, d.is_dead_ball, d.bat_runs, d.illegal_type, d.illegal_runs,
            d.extra_type, d.extra_runs, d.swap_striker_non_striker, d.bowler_match_player_id, d.voided,
            w.dismissal_type AS wicket_dismissal_type,
            w.dismissed_match_player_id AS wicket_dismissed_match_player_id,
            w.fielder_match_player_id AS wicket_fielder_match_player_id,
            w.secondary_fielder_match_player_id AS wicket_secondary_fielder_match_player_id,
            w.is_direct_hit AS wicket_is_direct_hit,
            w.runs_completed AS wicket_runs_completed
     FROM deliveries d
     LEFT JOIN wickets w ON w.delivery_id = d.id
     WHERE d.innings_id = $1
     ORDER BY d.log_sequence`,
    [inningsId]
  )
  return rows.map(rowToReplayEntry)
}

export async function insertDelivery(client, { inningsId, logSequence, recordedByUserId, clientActionId, input }) {
  const { rows } = await client.query(
    `INSERT INTO deliveries
       (innings_id, log_sequence, recorded_by_user_id, client_action_id, is_dead_ball, bat_runs,
        illegal_type, illegal_runs, extra_type, extra_runs, swap_striker_non_striker, bowler_match_player_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      inningsId,
      logSequence,
      recordedByUserId ?? null,
      clientActionId ?? null,
      Boolean(input.isDeadBall),
      input.batRuns || 0,
      input.illegal?.type ?? null,
      input.illegal?.runs ?? null,
      input.extra?.type ?? null,
      input.extra?.runs ?? null,
      Boolean(input.swapStrikerNonStriker),
      input.bowlerMatchPlayerId,
    ]
  )
  return rows[0]
}

export async function findDeliveryByClientActionId(client, inningsId, clientActionId) {
  if (!clientActionId) return null
  const { rows } = await client.query('SELECT * FROM deliveries WHERE innings_id = $1 AND client_action_id = $2', [inningsId, clientActionId])
  return rows[0] || null
}

// Phase 4: overwrites a delivery's AUTHORITATIVE columns (what a correction
// patches) — never the derived/cache columns, which updateDeliveryDerivedFields
// owns exclusively. `log_sequence`/`id` are never touched: a correction never
// changes a delivery's identity or position in the log.
export async function updateDeliveryAuthoritativeFields(client, deliveryId, input) {
  const { rows } = await client.query(
    `UPDATE deliveries
     SET is_dead_ball = $2, bat_runs = $3, illegal_type = $4, illegal_runs = $5,
         extra_type = $6, extra_runs = $7, swap_striker_non_striker = $8,
         bowler_match_player_id = $9, voided = $10, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      deliveryId,
      Boolean(input.isDeadBall),
      input.batRuns || 0,
      input.illegal?.type ?? null,
      input.illegal?.runs ?? null,
      input.extra?.type ?? null,
      input.extra?.runs ?? null,
      Boolean(input.swapStrikerNonStriker),
      input.bowlerMatchPlayerId,
      Boolean(input.voided),
    ]
  )
  return rows[0]
}

// `derived` is a delivery entry from a replayInnings() result: over/ball there
// are 1-indexed display values (over 1, ball 1 = the very first delivery), so
// we store the 0-indexed equivalents to match the innings-level overNumber/
// ballInOver convention used everywhere else (e.g. selectors.js formatOvers).
export async function updateDeliveryDerivedFields(client, deliveryId, derived) {
  const { rows } = await client.query(
    `UPDATE deliveries
     SET over_number = $2, ball_in_over = $3, striker_match_player_id = $4, non_striker_match_player_id = $5,
         is_legal_delivery = $6, is_free_hit = $7, total_runs = $8, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      deliveryId,
      derived.over - 1,
      derived.ball - 1,
      derived.strikerMatchPlayerId,
      derived.nonStrikerMatchPlayerId,
      derived.isLegalDelivery,
      derived.isFreeHit,
      derived.totalRuns,
    ]
  )
  return rows[0]
}

export async function findDeliveryById(id) {
  const { rows } = await pool.query('SELECT * FROM deliveries WHERE id = $1', [id])
  return rows[0] || null
}

export async function listDeliveriesByInnings(inningsId) {
  const { rows } = await pool.query('SELECT * FROM deliveries WHERE innings_id = $1 ORDER BY log_sequence', [inningsId])
  return rows
}
