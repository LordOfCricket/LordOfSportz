import { pool } from '../config/db.js'

export async function findFeedbackByMatchAndUser(matchId, userId) {
  const { rows } = await pool.query(`SELECT * FROM match_feedback WHERE match_id = $1 AND submitted_by = $2`, [matchId, userId])
  return rows[0] || null
}

// Eligibility's "did this user actually play in this match" check (U1's own
// stated design intent for this table) — any match_players row is enough,
// not just playing-XI, same convention U3's feedback-eligibility note
// already established for this exact relationship.
export async function isMatchParticipant(matchId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM match_players mp JOIN players p ON p.id = mp.player_id WHERE mp.match_id = $1 AND p.user_id = $2 LIMIT 1`,
    [matchId, userId],
  )
  return rows.length > 0
}

// `client` is the transaction client — this only ever runs inside
// submitFeedback's transaction, never standalone, so no client=pool default.
export async function insertMatchFeedback(
  client,
  { matchId, userId, groundRating, groundCommentLiked, groundCommentImprove, appRating, appCommentLiked, appCommentImprove, appFeatureLiked },
) {
  const { rows } = await client.query(
    `INSERT INTO match_feedback
       (match_id, submitted_by, ground_rating, ground_comment_liked, ground_comment_improve,
        app_rating, app_comment_liked, app_comment_improve, app_feature_liked)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [matchId, userId, groundRating, groundCommentLiked, groundCommentImprove, appRating, appCommentLiked, appCommentImprove, appFeatureLiked],
  )
  return rows[0]
}

// Phase 24, Workstream D — rating trend. Numeric ratings + timestamp only,
// no comments, no reviewer identity — this is the umpire viewing their own
// recent trend, not a public review feed. Newest-first at the DB level
// (LIMIT needs that ordering to pick the right N); the caller reverses to
// chronological for display, matching the brief's own "Last 5 matches: 4.6
// 4.8 4.7 4.9 5.0" left-to-right-oldest-to-newest example.
export async function findRecentRatingsForUmpire(umpireUserId, limit = 5) {
  const { rows } = await pool.query(
    `SELECT rating, created_at FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [umpireUserId, limit],
  )
  return rows
}

export async function insertUmpireRating(client, { matchFeedbackId, umpireUserId, rating, commentLiked, commentImprove }) {
  const { rows } = await client.query(
    `INSERT INTO match_feedback_umpire_ratings (match_feedback_id, umpire_user_id, rating, comment_liked, comment_improve)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [matchFeedbackId, umpireUserId, rating, commentLiked, commentImprove],
  )
  return rows[0]
}

// Phase 13 — Ground Owner review list. Same posture as
// findRecentRatingsForUmpire above: rating + comments + timestamp only, no
// submitted_by/user join at all — reviews are anonymous to the owner, not
// just "no email/phone," matching the existing precedent that umpire
// ratings never expose reviewer identity either. groundId always comes from
// req.ground.id (server-resolved, never client-supplied) at the call site.
export async function findGroundReviews(groundId, { limit, offset }) {
  const { rows } = await pool.query(
    `SELECT mf.ground_rating, mf.ground_comment_liked, mf.ground_comment_improve, mf.created_at,
            COUNT(*) OVER()::int AS total_count
     FROM match_feedback mf
     JOIN matches m ON m.id = mf.match_id
     WHERE m.ground_id = $1 AND mf.ground_rating IS NOT NULL
     ORDER BY mf.created_at DESC
     LIMIT $2 OFFSET $3`,
    [groundId, limit, offset],
  )
  const total = rows.length ? rows[0].total_count : 0
  return { rows, total }
}
