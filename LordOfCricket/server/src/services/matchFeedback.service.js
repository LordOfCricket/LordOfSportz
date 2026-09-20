import { pool } from '../config/db.js'
import { findMatchById } from '../models/match.model.js'
import { findGroundById } from '../models/ground.model.js'
import { findActiveMembership } from '../models/groundUser.model.js'
import { findSlotsByMatch } from '../models/matchUmpireSlot.model.js'
import { findFeedbackByMatchAndUser, isMatchParticipant, insertMatchFeedback, insertUmpireRating } from '../models/matchFeedback.model.js'
import { recalculateGroundRating, recalculateUmpireRating } from './ratingAggregation.service.js'
import { FeedbackError, FEEDBACK_ERROR_CODES as CODES } from '../domain/feedback/errors.js'

const FEEDBACK_OPEN_STATUSES = ['completed', 'finalized']
const RATING_MIN = 1
const RATING_MAX = 5
const APP_FEATURES = ['ground_discovery', 'match_information', 'umpire_system', 'live_scoring', 'player_statistics', 'canteen', 'notifications', 'other']

function clampComment(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null
}

async function assignedUmpires(matchId) {
  const slots = await findSlotsByMatch(matchId)
  // 'COMPLETED' as well as 'ASSIGNED' (Phase 23): feedback is only ever open
  // once a match reaches 'completed'/'finalized' (FEEDBACK_OPEN_STATUSES
  // below), and by that point every slot that was ASSIGNED has already
  // transitioned to COMPLETED (officiating credit, markSlotsCompletedForMatch)
  // — an ASSIGNED-only filter would find zero umpires for every completed
  // match, silently breaking umpire feedback/rating entirely.
  return slots.filter((s) => (s.status === 'ASSIGNED' || s.status === 'COMPLETED') && s.umpire_user_id).map((s) => ({ userId: s.umpire_user_id, name: s.umpire_name }))
}

// The single place eligibility is computed — GET and POST both call this,
// so the form a user sees and the submission the server accepts can never
// drift apart. Self-rating is excluded here (never in the ratable list at
// all), not just rejected later, and a Ground Owner reviewing their own
// ground is excluded the same way (ground_owner gets Umpire+App only —
// see the U6 report for why this extends the umpire self-rating rule by
// symmetry, not something the schema forces).
async function resolveEligibility(match, userId) {
  const [isParticipant, umpires, isGroundOwner] = await Promise.all([
    isMatchParticipant(match.id, userId),
    assignedUmpires(match.id),
    match.ground_id ? findActiveMembership(userId, match.ground_id, 'GROUND_OWNER').then(Boolean) : Promise.resolve(false),
  ])

  const isAssignedUmpire = umpires.some((u) => u.userId === userId)
  const eligible = isParticipant || isAssignedUmpire || isGroundOwner
  const ratableUmpires = eligible ? umpires.filter((u) => u.userId !== userId) : []

  return {
    eligible,
    // Ground category requires a real ground to review — a legacy match
    // with ground_id=NULL (U1: never backfilled) has nothing to rate, so
    // it's never offered rather than accepting a rating that would sit in
    // match_feedback uncounted by any aggregate (recalculateGroundRating
    // only runs when match.ground_id exists).
    categories: {
      ground: eligible && !isGroundOwner && Boolean(match.ground_id),
      umpire: ratableUmpires.length > 0,
      app: eligible,
    },
    ratableUmpires,
  }
}

export async function getFeedbackContext(matchId, userId) {
  const match = await findMatchById(matchId)
  if (!match) throw new FeedbackError(CODES.MATCH_NOT_FOUND, 'Match not found.')

  const available = FEEDBACK_OPEN_STATUSES.includes(match.status)
  if (!available) {
    return { available: false, alreadySubmitted: false, eligible: false, categories: { ground: false, umpire: false, app: false }, ground: null, ratableUmpires: [] }
  }

  const [existing, eligibility, ground] = await Promise.all([
    findFeedbackByMatchAndUser(matchId, userId),
    resolveEligibility(match, userId),
    match.ground_id ? findGroundById(match.ground_id) : Promise.resolve(null),
  ])

  return {
    available: true,
    alreadySubmitted: Boolean(existing),
    eligible: eligibility.eligible,
    categories: eligibility.categories,
    ground: ground ? { publicGroundId: ground.public_ground_id, name: ground.name } : null,
    ratableUmpires: eligibility.ratableUmpires.map((u) => ({ userId: u.userId, name: u.name })),
  }
}

function validRating(value) {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX
}

export async function submitFeedback({ matchId, userId, body }) {
  const match = await findMatchById(matchId)
  if (!match) throw new FeedbackError(CODES.MATCH_NOT_FOUND, 'Match not found.')
  if (!FEEDBACK_OPEN_STATUSES.includes(match.status)) {
    throw new FeedbackError(CODES.MATCH_NOT_ELIGIBLE, 'Feedback is not open for this match yet.')
  }

  const eligibility = await resolveEligibility(match, userId)
  if (!eligibility.eligible) {
    throw new FeedbackError(CODES.NOT_ELIGIBLE, 'You are not eligible to submit feedback for this match.')
  }

  // --- Validate the payload against what THIS user is actually eligible
  // for — never what they claim. A field present for a category the user
  // isn't eligible for is rejected outright, not silently dropped (silently
  // dropping would hide a client bug or spoofing attempt from the caller).
  const wantsGround = body?.groundRating != null || body?.groundCommentLiked != null || body?.groundCommentImprove != null
  if (wantsGround && !eligibility.categories.ground) {
    throw new FeedbackError(CODES.INVALID_CATEGORY, 'You are not eligible to review the ground for this match.')
  }
  let groundRating = null
  if (eligibility.categories.ground && body?.groundRating != null) {
    if (!validRating(body.groundRating)) throw new FeedbackError(CODES.INVALID_RATING, 'groundRating must be an integer between 1 and 5.')
    groundRating = body.groundRating
  }

  let appRating = null
  let appFeatureLiked = null
  if (body?.appRating != null) {
    if (!validRating(body.appRating)) throw new FeedbackError(CODES.INVALID_RATING, 'appRating must be an integer between 1 and 5.')
    appRating = body.appRating
  }
  if (body?.appFeatureLiked != null) {
    if (!APP_FEATURES.includes(body.appFeatureLiked)) throw new FeedbackError(CODES.INVALID_RATING, 'appFeatureLiked is not a recognized option.')
    appFeatureLiked = body.appFeatureLiked
  }

  const rawUmpireRatings = Array.isArray(body?.umpireRatings) ? body.umpireRatings : []
  const ratableIds = new Set(eligibility.ratableUmpires.map((u) => u.userId))
  const seenUmpireIds = new Set()
  const umpireRatings = []
  for (const entry of rawUmpireRatings) {
    const umpireUserId = Number(entry?.umpireUserId)
    // Covers both "not assigned to this match" and "rating yourself" in one
    // check — self was never added to ratableIds in the first place.
    if (!ratableIds.has(umpireUserId)) {
      throw new FeedbackError(CODES.INVALID_UMPIRE, 'You may only rate an umpire actually assigned to this match, and never yourself.')
    }
    if (seenUmpireIds.has(umpireUserId)) continue
    seenUmpireIds.add(umpireUserId)
    if (!validRating(entry.rating)) throw new FeedbackError(CODES.INVALID_RATING, 'Each umpire rating must be an integer between 1 and 5.')
    umpireRatings.push({
      umpireUserId,
      rating: entry.rating,
      commentLiked: clampComment(entry.commentLiked),
      commentImprove: clampComment(entry.commentImprove),
    })
  }

  if (groundRating == null && appRating == null && umpireRatings.length === 0) {
    throw new FeedbackError(CODES.EMPTY_SUBMISSION, 'Submit at least one rating.')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let feedback
    try {
      feedback = await insertMatchFeedback(client, {
        matchId: match.id,
        userId,
        groundRating,
        groundCommentLiked: groundRating != null ? clampComment(body.groundCommentLiked) : null,
        groundCommentImprove: groundRating != null ? clampComment(body.groundCommentImprove) : null,
        appRating,
        appCommentLiked: clampComment(body?.appCommentLiked),
        appCommentImprove: clampComment(body?.appCommentImprove),
        appFeatureLiked,
      })
    } catch (err) {
      if (err.code === '23505') {
        throw new FeedbackError(CODES.ALREADY_SUBMITTED, 'You have already submitted feedback for this match.')
      }
      throw err
    }

    for (const ur of umpireRatings) {
      await insertUmpireRating(client, { matchFeedbackId: feedback.id, ...ur })
    }

    // Aggregates recompute inside the SAME transaction as the insert — one
    // logical operation; a failure here rolls back the feedback row too,
    // never leaving a submission recorded with a stale aggregate.
    if (groundRating != null && match.ground_id) {
      await recalculateGroundRating(match.ground_id, client)
    }
    for (const ur of umpireRatings) {
      await recalculateUmpireRating(ur.umpireUserId, client)
    }

    await client.query('COMMIT')
    return feedback
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
