import { pool } from '../config/db.js'

export async function createUmpireRequest(userId) {
  const { rows } = await pool.query(
    `INSERT INTO umpire_requests (user_id)
     VALUES ($1)
     RETURNING id, user_id, status, requested_at, decided_at, decided_by`,
    [userId]
  )
  return rows[0]
}

export async function findLatestUmpireRequestForUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, status, requested_at, decided_at, decided_by
     FROM umpire_requests WHERE user_id = $1
     ORDER BY requested_at DESC LIMIT 1`,
    [userId]
  )
  return rows[0] || null
}

export async function findPendingUmpireRequests() {
  const { rows } = await pool.query(
    `SELECT ur.id, ur.user_id, ur.status, ur.requested_at, u.name, u.email
     FROM umpire_requests ur
     JOIN users u ON u.id = ur.user_id
     WHERE ur.status = 'pending'
     ORDER BY ur.requested_at ASC`
  )
  return rows
}

// Shared Gate 1 check (U2): player_type='umpire' alone is a declared intent,
// not a grant — only a LATEST umpire_requests row of status='approved' makes
// someone an approved umpire. Used by requireScorer (auth.js),
// requireMatchScorer (matchScorerAccess.js), and umpireAssignment.service.js
// so this rule is expressed in exactly one place.
export async function isApprovedUmpireUser(user) {
  if (user?.role !== 'player' || user?.player_type !== 'umpire') return false
  const latest = await findLatestUmpireRequestForUser(user.id)
  return latest?.status === 'approved'
}

// Every currently-approved umpire (Phase 23, Workstream G — replacement
// candidate pool) — same "latest request row per user" semantics as
// isApprovedUmpireUser above, expressed as a set instead of a single check,
// via a LATERAL join rather than a second, possibly-drifting definition of
// "approved".
export async function findApprovedUmpires() {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN LATERAL (
       SELECT status FROM umpire_requests ur WHERE ur.user_id = u.id ORDER BY ur.requested_at DESC LIMIT 1
     ) latest ON true
     WHERE u.role = 'player' AND u.player_type = 'umpire' AND latest.status = 'approved'
     ORDER BY u.name`
  )
  return rows
}

// Phase 24, Workstream B — "Experience" is derived from real approval
// history, never self-reported: the EARLIEST approval date across a user's
// requests (not the latest — a later rejection/re-approval cycle shouldn't
// erase the tenure they've actually had as an approved umpire).
export async function findFirstApprovalDate(userId) {
  const { rows } = await pool.query(`SELECT MIN(decided_at) AS first_approved_at FROM umpire_requests WHERE user_id = $1 AND status = 'approved'`, [userId])
  return rows[0]?.first_approved_at || null
}

export async function decideUmpireRequest(id, status, decidedBy) {
  const { rows } = await pool.query(
    `UPDATE umpire_requests
     SET status = $2, decided_at = NOW(), decided_by = $3
     WHERE id = $1
     RETURNING id, user_id, status, requested_at, decided_at, decided_by`,
    [id, status, decidedBy]
  )
  return rows[0] || null
}
