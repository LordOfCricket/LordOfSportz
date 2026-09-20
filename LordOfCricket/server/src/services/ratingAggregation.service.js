import { pool } from '../config/db.js'

// match_feedback is the source of truth (U6 product rule) — these two
// functions are the ONLY place rating_avg/rating_count are ever written,
// and both are pure recomputations from the raw rows, never incremental
// math on the cached value. Safe to call standalone (client defaults to
// pool, e.g. a future admin "recompute" tool) or inside an existing
// transaction (submitFeedback passes its own client so the recompute
// commits/rolls back atomically with the feedback insert it followed).
//
// AVG()/COUNT() run once per call — no intermediate rounding; the only
// rounding is the final cast to NUMERIC(3,2) for storage.

export async function recalculateGroundRating(groundId, client = pool) {
  const { rows } = await client.query(
    `SELECT AVG(mf.ground_rating)::numeric(3,2) AS avg, COUNT(mf.ground_rating)::int AS count
     FROM match_feedback mf
     JOIN matches m ON m.id = mf.match_id
     WHERE m.ground_id = $1 AND mf.ground_rating IS NOT NULL`,
    [groundId],
  )
  const { avg, count } = rows[0]
  await client.query(`UPDATE grounds SET rating_avg = $2, rating_count = $3 WHERE id = $1`, [groundId, avg, count])
  return { ratingAvg: avg, ratingCount: count }
}

export async function recalculateUmpireRating(umpireUserId, client = pool) {
  const { rows } = await client.query(
    `SELECT AVG(rating)::numeric(3,2) AS avg, COUNT(*)::int AS count FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1`,
    [umpireUserId],
  )
  const { avg, count } = rows[0]
  // umpire_profiles may not have a row yet for this umpire — same
  // get-or-create upsert shape umpireProfile.model.js already uses.
  await client.query(
    `INSERT INTO umpire_profiles (user_id, rating_avg, rating_count) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET rating_avg = EXCLUDED.rating_avg, rating_count = EXCLUDED.rating_count, updated_at = NOW()`,
    [umpireUserId, avg, count],
  )
  return { ratingAvg: avg, ratingCount: count }
}
