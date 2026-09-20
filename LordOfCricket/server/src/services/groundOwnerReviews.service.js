import { findGroundReviews } from '../models/matchFeedback.model.js'

// Phase 13 — Ground Owner Reviews. Surfaces existing match_feedback data
// (ground_rating/ground_comment_liked/ground_comment_improve, captured by
// the U6 post-match feedback flow) to the ground's own owner. Reviews are
// anonymous — no reviewer identity is ever attached, see
// matchFeedback.model.js#findGroundReviews's own comment for why.

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function getGroundReviews(groundId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
  const clampedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT))
  const clampedPage = Math.max(1, Number(page) || 1)
  const offset = (clampedPage - 1) * clampedLimit

  const { rows, total } = await findGroundReviews(groundId, { limit: clampedLimit, offset })

  return {
    reviews: rows.map((r) => ({
      rating: r.ground_rating,
      commentLiked: r.ground_comment_liked,
      commentImprove: r.ground_comment_improve,
      submittedAt: r.created_at,
    })),
    pagination: {
      page: clampedPage,
      limit: clampedLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / clampedLimit)),
    },
  }
}
