import { pool } from '../config/db.js'

// Umpire Proposals — a Ground Owner's invitation to a specific approved
// umpire for a specific OPEN slot, optionally with a bonus on top of the
// match's base fee. One row per (proposal), append-style — a slot can have
// several PENDING rows at once (multiple candidates), first to accept wins.

export async function insertProposal({ matchId, slotId, proposedBy, umpireUserId, incentiveAmount, currency = 'INR', message = null }, client = pool) {
  const { rows } = await client.query(
    `INSERT INTO umpire_proposals (match_id, match_umpire_slot_id, proposed_by, umpire_user_id, incentive_amount, currency, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [matchId, slotId, proposedBy, umpireUserId, incentiveAmount, currency, message],
  )
  return rows[0]
}

export async function findProposalById(id, client = pool) {
  const { rows } = await client.query(`SELECT * FROM umpire_proposals WHERE id = $1`, [id])
  return rows[0] || null
}

// Umpire's own inbox — pending offers first (newest first), with enough
// match/team/ground context to render a card without a second round trip.
export async function findPendingProposalsForUmpire(umpireUserId) {
  const { rows } = await pool.query(
    `SELECT p.*, m.match_date, m.status AS match_status,
            ta.name AS team_a_name, ta.short_name AS team_a_short,
            tb.name AS team_b_name, tb.short_name AS team_b_short,
            g.name AS ground_name, g.city AS ground_city,
            m.umpire_fee_amount, m.umpire_fee_currency,
            owner.name AS proposed_by_name
     FROM umpire_proposals p
     JOIN matches m ON m.id = p.match_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     LEFT JOIN grounds g ON g.id = m.ground_id
     JOIN users owner ON owner.id = p.proposed_by
     WHERE p.umpire_user_id = $1
     ORDER BY (p.status = 'PENDING') DESC, p.created_at DESC
     LIMIT 50`,
    [umpireUserId],
  )
  return rows
}

// Ground Owner's own view of proposals sent for one match.
export async function findProposalsForMatch(matchId) {
  const { rows } = await pool.query(
    `SELECT p.*, u.name AS umpire_name
     FROM umpire_proposals p
     JOIN users u ON u.id = p.umpire_user_id
     WHERE p.match_id = $1
     ORDER BY p.created_at DESC`,
    [matchId],
  )
  return rows
}

export async function findPendingProposalForSlotAndUmpire(slotId, umpireUserId, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM umpire_proposals WHERE match_umpire_slot_id = $1 AND umpire_user_id = $2 AND status = 'PENDING'`,
    [slotId, umpireUserId],
  )
  return rows[0] || null
}

export async function updateProposalStatus(id, status, client = pool) {
  const { rows } = await client.query(
    `UPDATE umpire_proposals SET status = $2, responded_at = NOW() WHERE id = $1 RETURNING *`,
    [id, status],
  )
  return rows[0] || null
}

// Bulk-expires every OTHER pending proposal for a slot the instant it's
// filled through ANY path (proposal acceptance, or a plain self-apply/
// replacement racing ahead of a pending offer) — returns the affected rows
// so the caller can notify those umpires that the opportunity is gone.
// `exceptProposalId` lets the winning proposal's own row (already being set
// to ACCEPTED separately) skip this bulk EXPIRED update.
export async function expirePendingProposalsForSlot(slotId, exceptProposalId, client = pool) {
  const { rows } = await client.query(
    `UPDATE umpire_proposals
     SET status = 'EXPIRED', responded_at = NOW()
     WHERE match_umpire_slot_id = $1 AND status = 'PENDING' AND ($2::int IS NULL OR id != $2)
     RETURNING *`,
    [slotId, exceptProposalId],
  )
  return rows
}

// Ground-owner-initiated withdrawal — only a still-PENDING proposal can be
// cancelled (one already accepted/declined/expired is a closed matter).
export async function cancelProposal(id, client = pool) {
  const { rows } = await client.query(
    `UPDATE umpire_proposals SET status = 'CANCELLED', responded_at = NOW() WHERE id = $1 AND status = 'PENDING' RETURNING *`,
    [id],
  )
  return rows[0] || null
}
