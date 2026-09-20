import { pool } from '../config/db.js'

// One row per slot (U1's approved Decision 3) — created once, at match
// creation, from matches.required_umpires. `client` defaults to pool but
// accepts a transaction client so match.service.js's createMatch can create
// the match row and its slots atomically.
export async function createSlotsForMatch(matchId, count, client = pool) {
  if (!count) return []
  const values = []
  const params = [matchId]
  for (let slotNumber = 1; slotNumber <= count; slotNumber++) {
    params.push(slotNumber)
    values.push(`($1, $${params.length})`)
  }
  const { rows } = await client.query(`INSERT INTO match_umpire_slots (match_id, slot_number) VALUES ${values.join(', ')} RETURNING *`, params)
  return rows
}

export async function findSlotById(slotId, client = pool) {
  const { rows } = await client.query(`SELECT * FROM match_umpire_slots WHERE id = $1`, [slotId])
  return rows[0] || null
}

export async function findSlotsByMatch(matchId) {
  const { rows } = await pool.query(
    `SELECT s.*, u.name AS umpire_name
     FROM match_umpire_slots s
     LEFT JOIN users u ON u.id = s.umpire_user_id
     WHERE s.match_id = $1
     ORDER BY s.slot_number`,
    [matchId],
  )
  return rows
}

export async function hasActiveSlotAssignment(matchId, userId, client = pool) {
  const { rows } = await client.query(`SELECT 1 FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2 AND status = 'ASSIGNED' LIMIT 1`, [
    matchId,
    userId,
  ])
  return rows.length > 0
}

// Authorization-only variant (Phase 23) — also true once the slot has
// transitioned to COMPLETED, not just ASSIGNED. Exists specifically for
// matchScorerAccess.js's Gate 2: since match completion now writes
// match_umpire_slots.status='COMPLETED' (officiating credit,
// markSlotsCompletedForMatch), an ASSIGNED-only check would incorrectly
// revoke the umpire's own ability to finalize the very match they just
// officiated — POST /matches/:id/finalize's deliberate 'completed'
// allowedStatuses exception depends on this. The SEPARATE allowedStatuses
// check right after this one is still what actually revokes access for
// every other route once a match completes — this only widens WHO counts as
// "held this assignment", never widens which match statuses are accepted.
// Deliberately NOT used by applyForSlot's ALREADY_ASSIGNED pre-check or by
// groundOwner.service.js's replacement-candidate exclusion — both of those
// mean something different ("is this umpire's ASSIGNED-right-now capacity
// already spoken for"), not "did they ever hold/complete this match".
export async function hasHeldSlotAssignment(matchId, userId, client = pool) {
  const { rows } = await client.query(
    `SELECT 1 FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2 AND status IN ('ASSIGNED', 'COMPLETED') LIMIT 1`,
    [matchId, userId],
  )
  return rows.length > 0
}

// Overlap-prevention read — every OTHER match this umpire currently holds an
// ASSIGNED slot on (CANCELLED/NO_SHOW/COMPLETED are never "active" here,
// matching hasActiveSlotAssignment's own exact definition of "active" —
// same notion reused, not redefined). `client` accepts the same-transaction
// connection applyForSlot's advisory lock runs in, so this read is
// serialized against any concurrent apply by the same umpire.
export async function findActiveAssignedMatchesForUmpire(userId, excludeMatchId = null, client = pool) {
  const { rows } = await client.query(
    `SELECT m.id, m.match_date, m.overs_per_innings, m.balls_per_over
     FROM match_umpire_slots s
     JOIN matches m ON m.id = s.match_id
     WHERE s.umpire_user_id = $1 AND s.status = 'ASSIGNED' AND ($2::int IS NULL OR m.id != $2)`,
    [userId, excludeMatchId],
  )
  return rows
}

// The atomic claim (U1 Decision 3 / Phase 0's slot-row design): the subquery
// locks and picks ONE eligible row (FOR UPDATE SKIP LOCKED — a concurrent
// claimer skips a row already locked by another in-flight claim rather than
// waiting for and then re-checking it), and the UPDATE only ever touches
// that single locked row. With exactly `required_umpires` rows ever existing
// for a match, over-allocation is structurally impossible — there is no
// count to race on. Eligible rows are AVAILABLE (never claimed) or
// CANCELLED (claimed once, then released) — both are open capacity.
export async function claimAvailableSlot(matchId, userId, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'ASSIGNED', umpire_user_id = $2, incentive_amount = 0, assigned_at = NOW(), cancelled_at = NULL, cancellation_reason = NULL
     WHERE id = (
       SELECT id FROM match_umpire_slots
       WHERE match_id = $1 AND status IN ('AVAILABLE', 'CANCELLED')
       ORDER BY slot_number
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [matchId, userId],
  )
  return rows[0] || null
}

// Umpire Proposals — a specific OPEN slot claimed by an umpire who accepted
// a ground-owner-initiated proposal, at whatever incentive that proposal
// offered (0 if none). Targets one exact row (never "any open slot" — the
// umpire is accepting THIS slot's specific offer), guarded by the same
// WHERE-status check every other slot-claiming UPDATE in this file uses —
// no advisory lock needed: a single targeted UPDATE with a status guard is
// naturally race-safe under Postgres's row-level locking (a losing
// concurrent acceptance simply finds 0 rows matched once the winner's
// UPDATE has committed).
export async function claimSpecificSlotForProposal(slotId, umpireUserId, incentiveAmount, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'ASSIGNED', umpire_user_id = $2, incentive_amount = $3, assigned_at = NOW(), cancelled_at = NULL, cancellation_reason = NULL
     WHERE id = $1 AND status IN ('AVAILABLE', 'CANCELLED')
     RETURNING *`,
    [slotId, umpireUserId, incentiveAmount],
  )
  return rows[0] || null
}

// No-show (Phase 23, Workstream F) — atomic guard: only a currently ASSIGNED
// slot can become NO_SHOW, so calling this twice or on a slot that's already
// moved on is a safe no-op (returns null), never a double-transition.
export async function markNoShow(slotId, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots SET status = 'NO_SHOW' WHERE id = $1 AND status = 'ASSIGNED' RETURNING *`,
    [slotId],
  )
  return rows[0] || null
}

// Replacement (Phase 23, Workstream G) — reuses the SAME slot row rather
// than creating a new one (required_umpires' fixed row count must never
// change), atomically guarded to only fire from NO_SHOW. Because
// requireMatchScorer/hasActiveSlotAssignment re-check umpire_user_id live on
// every request, this one UPDATE is what makes scoring access transfer to
// the replacement and revoke from the no-show umpire — no separate
// authorization change needed anywhere else.
export async function assignReplacementToSlot(slotId, newUmpireUserId, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'ASSIGNED', umpire_user_id = $2, incentive_amount = 0, assigned_at = NOW(), cancelled_at = NULL, cancellation_reason = NULL
     WHERE id = $1 AND status = 'NO_SHOW'
     RETURNING *`,
    [slotId, newUmpireUserId],
  )
  return rows[0] || null
}

// Check-in (Phase 23, Workstream E) — the assignment row itself already
// identifies match + umpire, so this is just 3 more facts about that same
// row, not a new entity. Idempotent by construction: the guarded UPDATE only
// ever fires once (checked_in_at IS NULL), so a second call can never
// overwrite the original check-in time/location — it falls through to the
// plain SELECT and returns what's already there.
export async function checkInSlot(matchId, umpireUserId, { latitude = null, longitude = null } = {}) {
  const { rows } = await pool.query(
    `UPDATE match_umpire_slots
     SET checked_in_at = NOW(), check_in_latitude = $3, check_in_longitude = $4
     WHERE match_id = $1 AND umpire_user_id = $2 AND status = 'ASSIGNED' AND checked_in_at IS NULL
     RETURNING *`,
    [matchId, umpireUserId, latitude, longitude],
  )
  if (rows[0]) return rows[0]
  const { rows: existing } = await pool.query(`SELECT * FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2 AND status = 'ASSIGNED'`, [
    matchId,
    umpireUserId,
  ])
  return existing[0] || null
}

// Officiating credit (Phase 23) — every slot still ASSIGNED the instant a
// match reaches a real result transitions to COMPLETED, whoever currently
// holds it (the original umpire, or a replacement who took over after a
// no-show — either way, whoever actually officiated). Called from inside
// the same transaction as the matches.status flip to 'completed', both call
// sites: match.service.js#completeMatchManually and
// scoring.service.js#maybeCompleteInnings (auto-completion). Returns the
// updated rows so the caller can log a COMPLETED event per slot.
export async function markSlotsCompletedForMatch(matchId, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'COMPLETED', completed_at = NOW()
     WHERE match_id = $1 AND status = 'ASSIGNED'
     RETURNING *`,
    [matchId],
  )
  return rows
}

// Scoped to (matchId, userId) in the WHERE clause itself — never a slot id
// or slot number supplied by the caller — so this can only ever cancel the
// CALLING user's own assignment. There is at most one ASSIGNED row per
// (match, umpire) by construction (the partial unique index from U1), so no
// slot identifier is needed to disambiguate which one. `client` accepts a
// transaction connection so the caller can log the CANCELLED event
// atomically alongside this update (see insertAssignmentEvent below).
export async function cancelMyAssignment(matchId, userId, reason = null, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $3
     WHERE match_id = $1 AND umpire_user_id = $2 AND status = 'ASSIGNED'
     RETURNING *`,
    [matchId, userId, reason],
  )
  return rows[0] || null
}

// Pre-match cancellation (Phase 6, Umpire Module) — a ground-owner-cancelled
// match releases every ASSIGNED slot the same way cancelMyAssignment does
// for one umpire's own self-cancel, just match-wide. Deliberately mirrors
// cancelMyAssignment's exact column writes (status/cancelled_at/
// cancellation_reason) — NOT paired with an insertAssignmentEvent call by
// its caller (see groundOwner.service.js#cancelGroundMatch's own comment):
// that event log's 'CANCELLED' type is exactly what getUmpireStats'
// matches_cancelled counts, which feeds computeReliability's score, and a
// match the GROUND OWNER cancelled (rain, double-booking, etc.) must never
// count against the umpire's own reliability the way a genuine self-
// cancellation does. matches.cancelled_by/cancelled_at is the authoritative
// "who/when" record for this action instead.
export async function cancelAllAssignedSlotsForMatch(matchId, reason = null, client = pool) {
  const { rows } = await client.query(
    `UPDATE match_umpire_slots
     SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $2
     WHERE match_id = $1 AND status = 'ASSIGNED'
     RETURNING *`,
    [matchId, reason],
  )
  return rows
}

// Append-only history log (Phase 23) — match_umpire_slots only ever holds
// CURRENT per-slot state, and a CANCELLED/NO_SHOW row can later be
// reclaimed/reassigned to a DIFFERENT umpire, overwriting umpire_user_id on
// that same row. Without this, the original umpire's no-show/cancellation
// would silently vanish from their own history the instant someone else
// takes the slot. `client` should be the same transaction connection as the
// state-changing write it's paired with, so the two commit/rollback
// together.
export async function insertAssignmentEvent({ slotId, matchId, umpireUserId, eventType, recordedBy = null }, client = pool) {
  await client.query(
    `INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type, recorded_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [slotId, matchId, umpireUserId, eventType, recordedBy],
  )
}

// U4 read #1 — umpire discovery: real 'upcoming' matches that still have
// open capacity (AVAILABLE or CANCELLED = reclaimable — same eligibility
// claimAvailableSlot uses). A match with required_umpires=0 has no slot rows
// at all, so EXISTS(...) is false and it never appears here — no invented
// slots, no match ever shown as "needs an umpire" that wasn't actually set
// up to have one.
export async function findAvailableMatchesForUmpire() {
  const { rows } = await pool.query(
    `SELECT
       m.id, m.match_date, m.venue, m.status, m.required_umpires,
       ta.name AS team_a_name, ta.short_name AS team_a_short,
       tb.name AS team_b_name, tb.short_name AS team_b_short,
       g.name AS ground_name, g.city AS ground_city,
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id) AS total_slots,
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status = 'ASSIGNED') AS filled_slots
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     LEFT JOIN grounds g ON g.id = m.ground_id
     WHERE m.status = 'upcoming'
       AND EXISTS (SELECT 1 FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status IN ('AVAILABLE', 'CANCELLED'))
     ORDER BY m.match_date ASC`,
  )
  return rows
}

// Umpire ground-wise discovery read — one batched query across every
// candidate ground (WHERE ground_id = ANY($1)), not a loop per ground, so
// this stays two DB round-trips total for the whole discovery endpoint
// regardless of how many grounds are nearby. Deliberately NOT filtered by
// slot availability or required_umpires>0 (unlike findAvailableMatchesForUmpire
// above) — a fully-staffed match and a required_umpires=0 match must still
// appear here so the ground itself still renders with those rows; the
// frontend derives each row's state/button from the real numbers instead
// of a row being silently dropped. current_user_assigned lets the frontend
// show "you're assigned" instead of an apply button, without a separate
// lookup.
export async function findUpcomingMatchesForGrounds(groundIds, userId) {
  if (!groundIds.length) return []
  const { rows } = await pool.query(
    `SELECT
       m.id, m.ground_id, m.match_date, m.venue, m.required_umpires,
       m.overs_per_innings, m.balls_per_over,
       ta.name AS team_a_name, ta.short_name AS team_a_short,
       tb.name AS team_b_name, tb.short_name AS team_b_short,
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id) AS total_slots,
       (SELECT COUNT(*)::int FROM match_umpire_slots s WHERE s.match_id = m.id AND s.status = 'ASSIGNED') AS filled_slots,
       EXISTS (SELECT 1 FROM match_umpire_slots s WHERE s.match_id = m.id AND s.umpire_user_id = $2 AND s.status = 'ASSIGNED') AS current_user_assigned
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.ground_id = ANY($1::int[]) AND m.status = 'upcoming'
     ORDER BY m.match_date ASC`,
    [groundIds, userId],
  )
  return rows
}

// U4 read #2 — "My Assignments": every slot this user has ever held, newest
// match first, with enough match/team/ground context to render a card
// without a second round trip. The frontend buckets by (match.status,
// slot.status) into upcoming/live/completed sections — no separate
// "history" query, this IS the history (Do NOT build advanced history
// analytics yet — plain chronological list is enough for U4).
export async function findSlotsForUmpire(userId) {
  const { rows } = await pool.query(
    `SELECT
       s.id, s.slot_number, s.status, s.assigned_at, s.cancelled_at, s.cancellation_reason,
       m.id AS match_id, m.match_date, m.venue, m.status AS match_status,
       ta.name AS team_a_name, ta.short_name AS team_a_short,
       tb.name AS team_b_name, tb.short_name AS team_b_short,
       g.name AS ground_name, g.city AS ground_city
     FROM match_umpire_slots s
     JOIN matches m ON m.id = s.match_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     LEFT JOIN grounds g ON g.id = m.ground_id
     WHERE s.umpire_user_id = $1
     ORDER BY m.match_date DESC`,
    [userId],
  )
  return rows
}

// Live stats, computed directly from match_umpire_slots/matches rather than
// umpire_profiles' cached counters (which nothing increments yet — showing
// them would mean "Matches Officiated" stays 0 forever even after a real
// match is officiated, which is worse than not caching). "Officiated" means
// held an ASSIGNED/COMPLETED slot on a match that reached a real result —
// current-state is correct here because COMPLETED always lands on whoever
// ACTUALLY officiated (a replacement's slot row is what transitions, not a
// second row for the original no-show umpire).
//
// no_shows/cancellations (Phase 23) intentionally do NOT read from
// match_umpire_slots' current status the way matches_officiated does — a
// CANCELLED or NO_SHOW slot can later be reclaimed/reassigned to a DIFFERENT
// umpire, overwriting that same row's umpire_user_id, which would silently
// erase the original umpire's own history from a current-state count. Both
// are instead counted from umpire_assignment_events, the append-only log
// that exists specifically to survive that overwrite.
export async function getUmpireStats(userId) {
  const [{ rows: slotRows }, { rows: eventRows }] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE m.status IN ('completed', 'finalized') AND s.status IN ('ASSIGNED', 'COMPLETED'))::int AS matches_officiated,
         COUNT(*) FILTER (WHERE m.status IN ('upcoming', 'live') AND s.status = 'ASSIGNED')::int AS upcoming_assignments
       FROM match_umpire_slots s
       JOIN matches m ON m.id = s.match_id
       WHERE s.umpire_user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'NO_SHOW')::int AS matches_no_show,
         COUNT(*) FILTER (WHERE event_type = 'CANCELLED')::int AS matches_cancelled
       FROM umpire_assignment_events
       WHERE umpire_user_id = $1`,
      [userId],
    ),
  ])
  return { ...slotRows[0], ...eventRows[0] }
}
