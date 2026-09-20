import { pool } from '../config/db.js'

// Phase 24 — SQL for the new tables backing the team/player conflict
// engine (schema.sql Phase 24). Kept separate from groundBooking.
// repository.js (which owns `ground_bookings` itself) the same way
// existing repositories are split one-table/concern-per-file.

// --- booking_teams (descriptive) --------------------------------------------

export async function insertBookingTeam(client, { bookingId, teamId, role = null }) {
  const { rows } = await client.query(
    `INSERT INTO booking_teams (booking_id, team_id, role) VALUES ($1,$2,$3) RETURNING *`,
    [bookingId, teamId, role]
  )
  return rows[0]
}

export async function findTeamsForBooking(bookingId, client = pool) {
  const { rows } = await client.query(
    `SELECT bt.*, t.name AS team_name, t.short_name AS team_short_name
     FROM booking_teams bt JOIN teams t ON t.id = bt.team_id
     WHERE bt.booking_id = $1 ORDER BY bt.id`,
    [bookingId]
  )
  return rows
}

// --- booking_team_slots / booking_player_slots (the live conflict guarantee)
// Rows exist only while the parent booking is in a blocking status — the
// EXCLUDE constraints on these tables ARE the atomic ground/team/player
// conflict check (see schema.sql Phase 24's own comment).

export async function insertTeamSlot(client, { bookingId, teamId, startTime, endTime }) {
  await client.query(
    `INSERT INTO booking_team_slots (booking_id, team_id, time_range) VALUES ($1, $2, tstzrange($3, $4, '[)'))`,
    [bookingId, teamId, startTime, endTime]
  )
}

export async function insertPlayerSlot(client, { bookingId, playerId, startTime, endTime }) {
  await client.query(
    `INSERT INTO booking_player_slots (booking_id, player_id, time_range) VALUES ($1, $2, tstzrange($3, $4, '[)'))`,
    [bookingId, playerId, startTime, endTime]
  )
}

/** Deletes every slot row for a booking — the mechanical meaning of
 * "release the slot" whenever a booking leaves a blocking status. Always
 * called in the same transaction as the status UPDATE. */
export async function deleteSlotsForBooking(client, bookingId) {
  await client.query('DELETE FROM booking_team_slots WHERE booking_id = $1', [bookingId])
  await client.query('DELETE FROM booking_player_slots WHERE booking_id = $1', [bookingId])
}

// --- booking_participants (permanent historical snapshot) ------------------

/** Inserts a participant row, or — if this exact (booking, player) pair was
 * previously removed — reactivates it (removed_at reset to NULL) rather
 * than violating the UNIQUE(booking_id, player_id) guarantee. */
export async function upsertParticipant(client, { bookingId, playerId }) {
  const { rows } = await client.query(
    `INSERT INTO booking_participants (booking_id, player_id) VALUES ($1, $2)
     ON CONFLICT (booking_id, player_id) DO UPDATE SET removed_at = NULL
     RETURNING *`,
    [bookingId, playerId]
  )
  return rows[0]
}

export async function markParticipantsRemoved(client, bookingId, playerIds) {
  await client.query(
    `UPDATE booking_participants SET removed_at = NOW() WHERE booking_id = $1 AND player_id = ANY($2::int[]) AND removed_at IS NULL`,
    [bookingId, playerIds]
  )
}

export async function findParticipantsForBooking(bookingId, { activeOnly = true } = {}, client = pool) {
  const { rows } = await client.query(
    `SELECT bp.*, p.name AS player_name, p.public_player_id, p.user_id
     FROM booking_participants bp JOIN players p ON p.id = bp.player_id
     WHERE bp.booking_id = $1 ${activeOnly ? 'AND bp.removed_at IS NULL' : ''}
     ORDER BY bp.added_at`,
    [bookingId]
  )
  return rows
}

// --- limit-check queries (§21) ----------------------------------------------

/** Count of a team's currently-blocking bookings whose slot hasn't ended
 * yet — the live definition of "active future bookings" used for the
 * per-team booking-limit check. */
export async function countActiveBookingsForTeam(teamId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT booking_id)::int AS count FROM booking_team_slots WHERE team_id = $1 AND upper(time_range) > NOW()`,
    [teamId]
  )
  return rows[0].count
}

/** Same definition, per player — used for the per-player booking-limit
 * check (independent of which team(s) each booking is for). */
export async function countActiveBookingsForPlayer(playerId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT booking_id)::int AS count FROM booking_player_slots WHERE player_id = $1 AND upper(time_range) > NOW()`,
    [playerId]
  )
  return rows[0].count
}

// --- expiry sweep (§6) -------------------------------------------------------
//
// Deliberately pure data-layer code (no service imports) so both
// bookingConflict.service.js (direct bookings) and matchProposal.service.js
// (proposals) can call it without creating a circular module dependency
// between those two services, which would otherwise need to share this
// logic. Postgres's EXCLUDE constraints can't reference NOW() — a
// constraint's blocking predicate is evaluated once, at write time, not
// continuously — so a real sweep (this) plus running it FIRST, inside the
// same transaction, at the start of every proposal/booking-creating write
// (the "lazy sweep on contention" pattern) is what actually guarantees an
// expired HOLD/PROPOSED row can never block a ground slot forever just
// because no external scheduler happened to run yet.

/** Every ground_bookings row at `groundId` still in a blocking-but-expired
 * state (HOLD/PROPOSED, past hold_expires_at). Row-locked (FOR UPDATE) so a
 * concurrent sweep for the same ground serializes rather than double-
 * processing the same row. */
async function findStaleHoldsForGround(client, groundId) {
  const { rows } = await client.query(
    `SELECT id, proposal_id FROM ground_bookings
     WHERE ground_id = $1 AND status IN ('HOLD','PROPOSED') AND hold_expires_at IS NOT NULL AND hold_expires_at <= NOW()
     FOR UPDATE`,
    [groundId]
  )
  return rows
}

/** Expires every stale hold at a ground: releases its team/player slots,
 * flips the booking to EXPIRED, and — when it's a proposal's booking (the
 * only case that exists today) — flips the linked match_proposals row
 * OPEN -> EXPIRED in the same breath. Idempotent and safe to call on every
 * write; a ground with nothing stale is a fast no-op (empty result from the
 * indexed WHERE above). Returns the list of booking ids that were expired. */
export async function sweepExpiredHolds(client, groundId) {
  const stale = await findStaleHoldsForGround(client, groundId)
  for (const row of stale) {
    await client.query('DELETE FROM booking_team_slots WHERE booking_id = $1', [row.id])
    await client.query('DELETE FROM booking_player_slots WHERE booking_id = $1', [row.id])
    await client.query(
      `UPDATE ground_bookings SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1 AND status IN ('HOLD','PROPOSED')`,
      [row.id]
    )
    if (row.proposal_id != null) {
      await client.query(
        `UPDATE match_proposals SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1 AND status = 'OPEN'`,
        [row.proposal_id]
      )
    }
  }
  return stale.map((r) => r.id)
}
