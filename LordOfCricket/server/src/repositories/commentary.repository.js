import { pool } from '../config/db.js'

export async function deleteByInnings(client, inningsId) {
  await client.query('DELETE FROM commentary_entries WHERE innings_id = $1', [inningsId])
}

/** Bulk insert for a full rebuild — the caller has already deleted every
 * existing row for this innings in the SAME transaction (Part 30's
 * "delete/replace projection transactionally"), so a plain INSERT is safe
 * here (no possible conflict). */
export async function insertMany(client, matchId, inningsId, entries) {
  const inserted = []
  for (const e of entries) {
    const { rows } = await client.query(
      `INSERT INTO commentary_entries
         (match_id, innings_id, entry_key, sequence, type, source_delivery_id, source_event_id,
          over_number, ball_in_over, ball_label, text, tags, score_runs, score_wickets, innings_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        matchId,
        inningsId,
        e.entryKey,
        e.sequence,
        e.type,
        e.sourceDeliveryId,
        e.sourceEventId,
        e.overNumber,
        e.ballInOver,
        e.ballLabel,
        e.text,
        JSON.stringify(e.tags || []),
        e.scoreRuns,
        e.scoreWickets,
        e.inningsVersion,
      ]
    )
    inserted.push(rows[0])
  }
  return inserted
}

/** Idempotent append for the normal-delivery fast path (Part 22/70) — a
 * retried clientActionId (and therefore a re-run of appendCommentaryForInnings
 * over an unchanged log) produces the SAME entryKey(s) and simply no-ops on
 * conflict rather than duplicating a row. Returns only the rows that were
 * ACTUALLY newly inserted, so the caller broadcasts exactly what's new. */
export async function insertIfAbsent(client, matchId, inningsId, entries) {
  const inserted = []
  for (const e of entries) {
    const { rows } = await client.query(
      `INSERT INTO commentary_entries
         (match_id, innings_id, entry_key, sequence, type, source_delivery_id, source_event_id,
          over_number, ball_in_over, ball_label, text, tags, score_runs, score_wickets, innings_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (innings_id, entry_key) DO NOTHING
       RETURNING *`,
      [
        matchId,
        inningsId,
        e.entryKey,
        e.sequence,
        e.type,
        e.sourceDeliveryId,
        e.sourceEventId,
        e.overNumber,
        e.ballInOver,
        e.ballLabel,
        e.text,
        JSON.stringify(e.tags || []),
        e.scoreRuns,
        e.scoreWickets,
        e.inningsVersion,
      ]
    )
    if (rows[0]) inserted.push(rows[0])
  }
  return inserted
}

/**
 * Newest-first page (matches the existing MatchTimelinePanel convention).
 * `before` (a sequence number, exclusive) is the pagination cursor for
 * "load older commentary" — omitted for the first page. Bounded: `limit` is
 * always clamped server-side (Part 34), never trusts an unbounded request.
 */
export async function listPage(inningsId, { before, limit, type }) {
  const params = [inningsId, limit]
  const conditions = ['innings_id = $1']
  if (before != null) {
    params.push(before)
    conditions.push(`sequence < $${params.length}`)
  }
  if (type) {
    params.push(type)
    conditions.push(`type = $${params.length}`)
  }
  const { rows } = await pool.query(`SELECT * FROM commentary_entries WHERE ${conditions.join(' AND ')} ORDER BY sequence DESC LIMIT $2`, params)
  return rows
}

export async function countByInnings(inningsId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM commentary_entries WHERE innings_id = $1', [inningsId])
  return rows[0].count
}

/** Phase 16 — every commentary entry for a WHOLE match (all innings),
 * sequence order within each innings, oldest innings first. Used only as
 * the deterministic candidate pool for AI key moments
 * (domain/ai/buildMatchAIContext.js) — never re-queried per player/event,
 * one call per match. */
export async function listByMatch(matchId) {
  const { rows } = await pool.query(
    `SELECT ce.*, i.innings_number
     FROM commentary_entries ce
     JOIN innings i ON i.id = ce.innings_id
     WHERE ce.match_id = $1
     ORDER BY i.innings_number ASC, ce.sequence ASC`,
    [matchId]
  )
  return rows
}
