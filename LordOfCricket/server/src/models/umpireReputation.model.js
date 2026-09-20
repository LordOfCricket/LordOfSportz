import { pool } from '../config/db.js'

// Phase 24 — the one batched query every reputation-summary consumer uses
// (self profile, ground-owner assigned-umpire view, replacement candidate
// picker), replacing what would otherwise be N+1 queries when showing
// reputation for a list of umpires. Mirrors getUmpireStats' exact
// officiated/no-show/cancellation logic (matchUmpireSlot.model.js) and
// isApprovedUmpireUser's exact "latest request row" verification semantics
// (umpireRequest.model.js) — same rules, just expressed once per user via
// LATERAL joins instead of one query per user. LEFT JOINs throughout so a
// user with no umpire_profiles row yet, or no umpire_requests row at all,
// still gets one honest all-null/zero row back rather than being silently
// dropped from the result set.
export async function findReputationSummaryRows(userIds) {
  if (!userIds?.length) return []
  const { rows } = await pool.query(
    `SELECT
       u.id AS user_id,
       u.name,
       COALESCE(latest.status = 'approved', false) AS verified,
       approval.first_approved_at,
       up.rating_avg,
       up.rating_count,
       COALESCE(officiated.matches_officiated, 0) AS matches_officiated,
       COALESCE(events.no_shows, 0) AS no_shows,
       COALESCE(events.cancellations, 0) AS cancellations
     FROM users u
     LEFT JOIN umpire_profiles up ON up.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT status FROM umpire_requests ur WHERE ur.user_id = u.id ORDER BY ur.requested_at DESC LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT MIN(decided_at) AS first_approved_at FROM umpire_requests ur2 WHERE ur2.user_id = u.id AND ur2.status = 'approved'
     ) approval ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE m.status IN ('completed', 'finalized') AND s.status IN ('ASSIGNED', 'COMPLETED'))::int AS matches_officiated
       FROM match_umpire_slots s
       JOIN matches m ON m.id = s.match_id
       WHERE s.umpire_user_id = u.id
     ) officiated ON true
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE event_type = 'NO_SHOW')::int AS no_shows,
         COUNT(*) FILTER (WHERE event_type = 'CANCELLED')::int AS cancellations
       FROM umpire_assignment_events
       WHERE umpire_user_id = u.id
     ) events ON true
     WHERE u.id = ANY($1::int[])`,
    [userIds],
  )
  return rows
}
