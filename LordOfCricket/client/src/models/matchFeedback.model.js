// U6 — pure helpers for the post-match feedback form. Mirrors the backend's
// domain/feedback/errors.js codes and matchFeedback.service.js's fixed
// APP_FEATURES list exactly, so a code/value here always means the same
// thing the server means by it.

export const APP_FEATURES = [
  { value: 'ground_discovery', label: 'Ground discovery' },
  { value: 'match_information', label: 'Match information' },
  { value: 'umpire_system', label: 'Umpire system' },
  { value: 'live_scoring', label: 'Live scoring' },
  { value: 'player_statistics', label: 'Player statistics' },
  { value: 'canteen', label: 'Canteen' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'other', label: 'Other' },
]

export function isValidRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

const ERROR_MESSAGES = {
  MATCH_NOT_FOUND: 'This match no longer exists.',
  MATCH_NOT_ELIGIBLE: 'Feedback is not open for this match yet.',
  NOT_ELIGIBLE: "You're not eligible to submit feedback for this match.",
  ALREADY_SUBMITTED: "You've already submitted feedback for this match.",
  INVALID_CATEGORY: "You're not eligible to review that category.",
  INVALID_UMPIRE: 'That umpire cannot be rated for this match.',
  INVALID_RATING: 'Ratings must be between 1 and 5.',
  EMPTY_SUBMISSION: 'Submit at least one rating before sending feedback.',
}

export function feedbackErrorMessage(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || 'Unable to submit feedback.'
}

// Builds the POST payload from form state, omitting a category entirely
// when its rating was never set (rather than sending a 0/null rating the
// backend would reject) — matches the backend's own "don't require every
// category" rule.
export function buildFeedbackPayload({ groundRating, groundLiked, groundImprove, appRating, appFeature, appLiked, appImprove, umpireRatings }) {
  const payload = {}
  if (groundRating) {
    payload.groundRating = groundRating
    if (groundLiked) payload.groundCommentLiked = groundLiked
    if (groundImprove) payload.groundCommentImprove = groundImprove
  }
  if (appRating) {
    payload.appRating = appRating
    if (appFeature) payload.appFeatureLiked = appFeature
    if (appLiked) payload.appCommentLiked = appLiked
    if (appImprove) payload.appCommentImprove = appImprove
  }
  const filledUmpireRatings = Object.entries(umpireRatings || {})
    .filter(([, u]) => u?.rating)
    .map(([umpireUserId, u]) => ({
      umpireUserId: Number(umpireUserId),
      rating: u.rating,
      ...(u.liked ? { commentLiked: u.liked } : {}),
      ...(u.improve ? { commentImprove: u.improve } : {}),
    }))
  if (filledUmpireRatings.length) payload.umpireRatings = filledUmpireRatings
  return payload
}

export function hasAnyRating(payload) {
  return Boolean(payload.groundRating || payload.appRating || payload.umpireRatings?.length)
}
