import { pool } from '../config/db.js'

// Match operational incident log (Phase 23, Workstream I) — always tied to
// exactly one match, one reporter, one timestamp. Not a generic issue
// tracker: no status/assignee/resolution fields, just what happened and
// when.
export async function insertIncident({ matchId, reportedBy, incidentType, description, occurredAt }) {
  const { rows } = await pool.query(
    `INSERT INTO match_incidents (match_id, reported_by, incident_type, description, occurred_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
     RETURNING *`,
    [matchId, reportedBy, incidentType, description ?? null, occurredAt ?? null],
  )
  return rows[0]
}

export async function findIncidentsByMatch(matchId) {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS reported_by_name
     FROM match_incidents i
     JOIN users u ON u.id = i.reported_by
     WHERE i.match_id = $1
     ORDER BY i.occurred_at DESC`,
    [matchId],
  )
  return rows
}
