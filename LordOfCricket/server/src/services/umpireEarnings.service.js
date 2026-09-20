import { findEarningsSummaryForUmpire, findRecentEarningsForUmpire } from '../models/umpireEarning.model.js'

function toRecentDTO(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    groundName: row.ground_name,
    teamAName: row.team_a_name,
    teamBName: row.team_b_name,
    matchDate: row.match_date,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Umpire Communication & Commercial 2.0 (Workstream J/P/Q) — one cohesive
// summary + bounded recent list, never 4 separate fee/earnings/status/
// history endpoints (mirrors the reputation-summary "one batched builder"
// convention). hasAnyData distinguishes "genuinely zero earnings" from "no
// commercial records exist yet" — never displays a fabricated ₹0 when the
// honest answer is "no earnings data yet".
export async function getMyEarningsSummary(umpireUserId) {
  const [summary, recent] = await Promise.all([findEarningsSummaryForUmpire(umpireUserId), findRecentEarningsForUmpire(umpireUserId, 10)])
  return {
    summary: {
      thisMonth: summary.this_month,
      pending: summary.pending,
      paid: summary.paid,
      hasAnyData: summary.total_count > 0,
    },
    recent: recent.map(toRecentDTO),
  }
}
