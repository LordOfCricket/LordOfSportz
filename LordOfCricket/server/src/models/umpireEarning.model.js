import { pool } from '../config/db.js'

// Umpire Communication & Commercial 2.0 — one row per umpire who actually
// COMPLETED a slot on a match that had a fee set at completion time.
// UNIQUE(match_umpire_slot_id) (schema.sql) makes "no duplicate earning for
// the same completed assignment" a DB guarantee — this INSERT ... ON
// CONFLICT DO NOTHING relies on exactly that.

// Idempotent — safe to call from every match-completion write path AND as a
// lazy defensive backstop on every read, mirroring the "recompute live,
// never trust one write path" convention Reputation 2.0 already
// established (buildReputationSummaries).
//
// Umpire Proposals — each completed slot's own amount is now
// base fee + that slot's own incentive_amount (0 unless an accepted
// proposal set it), not a flat match-wide amount. Only rows whose real
// total is > 0 are ever created — a match with no fee AND no accepted
// bonus for a given slot still creates nothing there (never a fabricated
// ₹0 earning), but a slot with ONLY an accepted bonus (no base fee ever
// set) now correctly still earns for that bonus alone.
export async function ensureEarningRecordsForMatch(matchId, client = pool) {
  const { rows: matchRows } = await client.query(`SELECT umpire_fee_amount, umpire_fee_currency FROM matches WHERE id = $1`, [matchId])
  const match = matchRows[0]
  if (!match) return []
  const baseFee = match.umpire_fee_amount != null ? Number(match.umpire_fee_amount) : 0
  const currency = match.umpire_fee_currency || 'INR'

  const { rows: completedSlots } = await client.query(
    `SELECT id, umpire_user_id, incentive_amount FROM match_umpire_slots WHERE match_id = $1 AND status = 'COMPLETED' AND umpire_user_id IS NOT NULL`,
    [matchId],
  )
  const eligible = completedSlots
    .map((s) => ({ ...s, total: baseFee + Number(s.incentive_amount || 0) }))
    .filter((s) => s.total > 0)
  if (!eligible.length) return []

  const { rows } = await client.query(
    `INSERT INTO umpire_earnings (match_id, match_umpire_slot_id, umpire_user_id, amount, currency)
     SELECT $1, slot_id, umpire_id, amount, $2
     FROM unnest($3::int[], $4::int[], $5::numeric[]) AS t(slot_id, umpire_id, amount)
     ON CONFLICT (match_umpire_slot_id) DO NOTHING
     RETURNING *`,
    [matchId, currency, eligible.map((s) => s.id), eligible.map((s) => s.umpire_user_id), eligible.map((s) => s.total)],
  )
  return rows
}

export async function findEarningsForMatch(matchId) {
  const { rows } = await pool.query(`SELECT * FROM umpire_earnings WHERE match_id = $1`, [matchId])
  return rows
}

export async function findEarningBySlotId(slotId) {
  const { rows } = await pool.query(`SELECT * FROM umpire_earnings WHERE match_umpire_slot_id = $1`, [slotId])
  return rows[0] || null
}

export async function updatePaymentStatus(earningId, status) {
  const { rows } = await pool.query(`UPDATE umpire_earnings SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [earningId, status])
  return rows[0] || null
}

// Umpire's own earnings — a small, cohesive summary (This Month / Pending /
// Paid totals) plus a bounded recent list, one round trip each, never N+1.
export async function findEarningsSummaryForUmpire(umpireUserId) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS this_month,
       COALESCE(SUM(amount) FILTER (WHERE status IN ('PENDING', 'APPROVED')), 0) AS pending,
       COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0) AS paid,
       COUNT(*)::int AS total_count
     FROM umpire_earnings
     WHERE umpire_user_id = $1`,
    [umpireUserId],
  )
  return rows[0]
}

export async function findRecentEarningsForUmpire(umpireUserId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT e.id, e.amount, e.currency, e.status, e.created_at, e.updated_at,
            m.id AS match_id, m.match_date, m.venue,
            g.name AS ground_name,
            ta.name AS team_a_name, tb.name AS team_b_name
     FROM umpire_earnings e
     JOIN matches m ON m.id = e.match_id
     LEFT JOIN grounds g ON g.id = m.ground_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE e.umpire_user_id = $1
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [umpireUserId, limit],
  )
  return rows
}
