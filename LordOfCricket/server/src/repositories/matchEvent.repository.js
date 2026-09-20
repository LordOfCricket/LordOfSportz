import { pool } from '../config/db.js'

function rowToReplayEntry(row) {
  return {
    kind: 'event',
    id: String(row.id),
    logSequence: row.log_sequence,
    eventType: row.event_type,
    payload: row.payload,
    voided: row.voided,
  }
}

export async function listMatchEventsForReplay(inningsId, client = pool) {
  const { rows } = await client.query(
    'SELECT id, log_sequence, event_type, payload, voided FROM match_events WHERE innings_id = $1 ORDER BY log_sequence',
    [inningsId]
  )
  return rows.map(rowToReplayEntry)
}

export async function insertMatchEvent(client, { inningsId, deliveryId = null, logSequence, clientActionId, eventType, payload }) {
  const { rows } = await client.query(
    `INSERT INTO match_events (innings_id, delivery_id, log_sequence, client_action_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [inningsId, deliveryId, logSequence, clientActionId ?? null, eventType, payload || {}]
  )
  return rows[0]
}

export async function findMatchEventByClientActionId(client, inningsId, clientActionId) {
  if (!clientActionId) return null
  const { rows } = await client.query('SELECT * FROM match_events WHERE innings_id = $1 AND client_action_id = $2', [inningsId, clientActionId])
  return rows[0] || null
}

// Phase 4: a correction may only change `payload`/`voided` — event_type and
// log_sequence/id (identity/position) never change.
export async function updateMatchEventAuthoritativeFields(client, eventId, entry) {
  const { rows } = await client.query('UPDATE match_events SET payload = $2, voided = $3, updated_at = NOW() WHERE id = $1 RETURNING *', [
    eventId,
    entry.payload || {},
    Boolean(entry.voided),
  ])
  return rows[0]
}

export async function findMatchEventById(id) {
  const { rows } = await pool.query('SELECT * FROM match_events WHERE id = $1', [id])
  return rows[0] || null
}

export async function listMatchEventsByInnings(inningsId) {
  const { rows } = await pool.query('SELECT * FROM match_events WHERE innings_id = $1 ORDER BY log_sequence', [inningsId])
  return rows
}
