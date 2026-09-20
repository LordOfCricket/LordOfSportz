import { pool } from '../config/db.js'
import { utcToGroundLocalParts } from '../domain/shared/groundTime.js'
import { computeReliability } from '../domain/umpireAssignment/reliability.js'

// Umpire Intelligence & Scale 2.0, Workstreams G/H/X/Y — a real monthly
// breakdown, sourced from the same authoritative tables every other umpire
// number already comes from: umpire_assignment_events (Phase 23's
// append-only officiating-credit/no-show/cancellation log — the same
// COMPLETED count getUmpireStats/buildReputationSummaries derive
// matchesOfficiated from elsewhere) and match_feedback_umpire_ratings (U6's
// rating source). Both TIMESTAMPTZ, so — unlike matches.match_date — there
// is no naive-column timezone hazard here (Workstream Y). Month-bucketing
// is done in JS via the existing groundTime.js utility, never a new SQL
// timezone interpretation.

function monthKey(date) {
  const { year, month } = utcToGroundLocalParts(date)
  return `${year}-${String(month).padStart(2, '0')}`
}

function lastNMonthKeys(n, now) {
  const { year, month } = utcToGroundLocalParts(now)
  const keys = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * findMonthlyOfficiatingTrend(umpireUserId, months=6) -> [{ month:
 * 'YYYY-MM', matchesOfficiated, reliability, ratingAvg }], oldest first.
 * `reliability`/`ratingAvg` are null (never 0/fabricated) for a month with
 * no terminal events / no ratings.
 */
export async function findMonthlyOfficiatingTrend(umpireUserId, months = 6) {
  const now = new Date()
  // Deliberately coarse (months+1 * 31 days) — exact month bucketing
  // happens in JS below; this is just a bounded fetch window so a veteran
  // umpire's entire multi-year history is never pulled for a 6-month view.
  const cutoff = new Date(now.getTime() - (months + 1) * 31 * 24 * 3600 * 1000)

  const [{ rows: eventRows }, { rows: ratingRows }] = await Promise.all([
    pool.query(
      `SELECT event_type, recorded_at FROM umpire_assignment_events
       WHERE umpire_user_id = $1 AND event_type IN ('COMPLETED','NO_SHOW','CANCELLED') AND recorded_at >= $2`,
      [umpireUserId, cutoff],
    ),
    pool.query(`SELECT rating, created_at FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1 AND created_at >= $2`, [umpireUserId, cutoff]),
  ])

  const monthKeys = lastNMonthKeys(months, now)
  const buckets = new Map(monthKeys.map((k) => [k, { completed: 0, noShows: 0, cancellations: 0, ratingSum: 0, ratingCount: 0 }]))

  for (const row of eventRows) {
    const key = monthKey(new Date(row.recorded_at))
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.event_type === 'COMPLETED') bucket.completed += 1
    else if (row.event_type === 'NO_SHOW') bucket.noShows += 1
    else if (row.event_type === 'CANCELLED') bucket.cancellations += 1
  }
  for (const row of ratingRows) {
    const key = monthKey(new Date(row.created_at))
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.ratingSum += Number(row.rating)
    bucket.ratingCount += 1
  }

  return monthKeys.map((key) => {
    const bucket = buckets.get(key)
    return {
      month: key,
      matchesOfficiated: bucket.completed,
      reliability: computeReliability({ completed: bucket.completed, noShows: bucket.noShows, cancellations: bucket.cancellations }),
      ratingAvg: bucket.ratingCount > 0 ? Math.round((bucket.ratingSum / bucket.ratingCount) * 100) / 100 : null,
    }
  })
}
