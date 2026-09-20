import { pool } from '../config/db.js'
import { listDeliveriesForReplay } from './delivery.repository.js'
import { listMatchEventsForReplay } from './matchEvent.repository.js'

export async function createInnings({ matchId, inningsNumber, battingTeamId, bowlingTeamId }) {
  const { rows } = await pool.query(
    `INSERT INTO innings (match_id, innings_number, batting_team_id, bowling_team_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'live', NOW())
     RETURNING *`,
    [matchId, inningsNumber, battingTeamId, bowlingTeamId]
  )
  return rows[0]
}

export async function findInningsById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM innings WHERE id = $1', [id])
  return rows[0] || null
}

export async function listInningsByMatch(matchId) {
  const { rows } = await pool.query('SELECT * FROM innings WHERE match_id = $1 ORDER BY innings_number', [matchId])
  return rows
}

/** Locks the innings row for the duration of the recording transaction — the
 * concurrency boundary every delivery/event write goes through. */
export async function lockInningsForUpdate(client, id) {
  const { rows } = await client.query('SELECT * FROM innings WHERE id = $1 FOR UPDATE', [id])
  return rows[0] || null
}

/** Claims the next chronological slot in this innings' shared delivery/event
 * ordering axis. Must be called with the row already locked (lockInningsForUpdate). */
export async function claimNextLogSequence(client, inningsId) {
  const { rows } = await client.query(
    'UPDATE innings SET next_log_sequence = next_log_sequence + 1 WHERE id = $1 RETURNING next_log_sequence - 1 AS assigned',
    [inningsId]
  )
  return rows[0].assigned
}

/** Optimistic-concurrency bump. Returns the new version, or null if `expectedVersion`
 * no longer matches (meaning something else in this transaction was inconsistent
 * with the FOR UPDATE lock already held — defensive, should not normally trigger). */
export async function bumpVersion(client, inningsId, expectedVersion) {
  const { rows } = await client.query('UPDATE innings SET version = version + 1 WHERE id = $1 AND version = $2 RETURNING version', [
    inningsId,
    expectedVersion,
  ])
  return rows[0]?.version ?? null
}

/** Overwrites the innings-level derived/cache columns. Never called with
 * anything except a freshly replayed state — this is a rebuildable read model,
 * not independent truth. */
export async function updateInningsCache(client, inningsId, cache) {
  const { rows } = await client.query(
    `UPDATE innings
     SET runs = $2, wickets = $3, legal_balls = $4,
         striker_match_player_id = $5, non_striker_match_player_id = $6, bowler_match_player_id = $7,
         is_free_hit_next = $8, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [inningsId, cache.runs, cache.wickets, cache.legalBalls, cache.strikerMatchPlayerId, cache.nonStrikerMatchPlayerId, cache.bowlerMatchPlayerId, cache.isFreeHitNext]
  )
  return rows[0]
}

export async function updateInningsStatus(inningsId, status, extra = {}, client = pool) {
  const setParts = ['status = $2']
  const values = [inningsId, status]
  if (status === 'live' && !extra.skipStartedAt) {
    setParts.push('started_at = COALESCE(started_at, NOW())')
  }
  if (status === 'completed' || status === 'forfeited' || status === 'declared') {
    setParts.push('completed_at = NOW()')
  }
  const { rows } = await client.query(`UPDATE innings SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, values)
  return rows[0] || null
}

/** The merged, log_sequence-ordered array of delivery + event entries that
 * replayInnings() expects — the one place deliveries and match_events get
 * combined back into their original chronological order. */
export async function loadInningsLog(inningsId, client = pool) {
  const [deliveries, events] = await Promise.all([listDeliveriesForReplay(inningsId, client), listMatchEventsForReplay(inningsId, client)])
  return [...deliveries, ...events].sort((a, b) => a.logSequence - b.logSequence)
}
