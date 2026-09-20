import { pool } from '../config/db.js'

// Phase 25 — SQL for match_proposals. The actual ground/team/time
// reservation lives in ground_bookings (see bookingConflict.service.js) —
// this table is thin metadata (who proposed, expiry, who accepted) layered
// on top, per schema.sql Phase 25's own comment.

export async function insertProposal(client, { publicProposalId, groundId, bookingId, proposingTeamId, proposalExpiresAt, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO match_proposals (public_proposal_id, ground_id, booking_id, proposing_team_id, proposal_expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [publicProposalId, groundId, bookingId, proposingTeamId, proposalExpiresAt, createdBy]
  )
  return rows[0]
}

export async function findByPublicId(publicProposalId, client = pool) {
  const { rows } = await client.query('SELECT * FROM match_proposals WHERE public_proposal_id = $1', [publicProposalId])
  return rows[0] || null
}

export async function findById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM match_proposals WHERE id = $1', [id])
  return rows[0] || null
}

export async function findByBookingId(bookingId, client = pool) {
  const { rows } = await client.query('SELECT * FROM match_proposals WHERE booking_id = $1', [bookingId])
  return rows[0] || null
}

/** The atomic "claim" for acceptance (§9/§10 — double acceptance, multiple
 * teams accepting simultaneously): a single conditional UPDATE naturally
 * serializes concurrent acceptors under Postgres's own row-level locking —
 * two concurrent UPDATEs with the same `WHERE status = 'OPEN'` predicate can
 * never both affect the row; the second one blocks until the first commits,
 * then re-evaluates the predicate against the now-CONFIRMED row and affects
 * 0 rows. Also requires `proposal_expires_at > NOW()` so a request racing
 * against its own expiry can never win. The CHECK constraint
 * match_proposals_teams_differ is a second, DB-level backstop against
 * self-acceptance even if the application-level check were ever bypassed. */
export async function claimProposal(client, { id, acceptingTeamId, acceptingUserId }) {
  const { rows } = await client.query(
    `UPDATE match_proposals
     SET status = 'CONFIRMED', accepted_by_team_id = $2, accepted_by_user_id = $3, updated_at = NOW()
     WHERE id = $1 AND status = 'OPEN' AND proposal_expires_at > NOW()
     RETURNING *`,
    [id, acceptingTeamId, acceptingUserId]
  )
  return rows[0] || null
}

export async function updateProposalStatus(client, id, fromStatus, toStatus, extra = {}) {
  const fields = { status: toStatus, updated_at: new Date(), ...extra }
  const keys = Object.keys(fields)
  const setClause = keys.map((key, i) => `${key} = $${i + 3}`).join(', ')
  const { rows } = await client.query(
    `UPDATE match_proposals SET ${setClause} WHERE id = $1 AND status = $2 RETURNING *`,
    [id, fromStatus, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

/** §21 — proposal-hoarding protection: how many OPEN proposals a team
 * currently has out, independent of (in addition to) the general active-
 * booking-count limit (an OPEN proposal already counts toward that too,
 * since its booking row holds a live team_slot — this is a second, more
 * targeted guard specifically against many simultaneous opponent-searches). */
export async function countOpenProposalsForTeam(teamId, client = pool) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM match_proposals WHERE proposing_team_id = $1 AND status = 'OPEN'`, [teamId])
  return rows[0].count
}

/** Discovery — every OPEN, not-yet-expired proposal at a ground, for
 * another team to browse and accept. */
export async function listOpenProposalsForGround(groundId, client = pool) {
  const { rows } = await client.query(
    `SELECT mp.*, gb.start_time, gb.end_time, gb.match_format, gb.purpose, t.name AS proposing_team_name, t.short_name AS proposing_team_short_name
     FROM match_proposals mp
     JOIN ground_bookings gb ON gb.id = mp.booking_id
     JOIN teams t ON t.id = mp.proposing_team_id
     WHERE mp.ground_id = $1 AND mp.status = 'OPEN' AND mp.proposal_expires_at > NOW()
     ORDER BY gb.start_time`,
    [groundId]
  )
  return rows
}

/** §6 — the real, proactive sweep (in addition to the lazy per-transaction
 * sweep in bookingConflict.service.js): every OPEN proposal whose expiry
 * has passed, so a future scheduler (or an ops script) can flip them
 * without waiting for someone else's write to trigger the lazy path. */
export async function listExpiredOpenProposals(client = pool) {
  const { rows } = await client.query(`SELECT * FROM match_proposals WHERE status = 'OPEN' AND proposal_expires_at <= NOW()`)
  return rows
}
