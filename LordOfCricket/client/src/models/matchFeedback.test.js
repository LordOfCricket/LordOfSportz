// Run with: node --test src/models/matchFeedback.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidRating, feedbackErrorMessage, buildFeedbackPayload, hasAnyRating, APP_FEATURES } from './matchFeedback.model.js'

test('isValidRating accepts only integers 1-5', () => {
  assert.equal(isValidRating(1), true)
  assert.equal(isValidRating(5), true)
  assert.equal(isValidRating(3), true)
  assert.equal(isValidRating(0), false)
  assert.equal(isValidRating(6), false)
  assert.equal(isValidRating(3.5), false)
  assert.equal(isValidRating(null), false)
  assert.equal(isValidRating(undefined), false)
})

test('feedbackErrorMessage maps every backend code, falls back gracefully', () => {
  assert.equal(feedbackErrorMessage('ALREADY_SUBMITTED'), "You've already submitted feedback for this match.")
  assert.equal(feedbackErrorMessage('INVALID_UMPIRE'), 'That umpire cannot be rated for this match.')
  assert.equal(feedbackErrorMessage('SOMETHING_NEW', 'server said x'), 'server said x')
  assert.equal(feedbackErrorMessage('SOMETHING_NEW'), 'Unable to submit feedback.')
})

test('buildFeedbackPayload omits a category entirely when its rating was never set', () => {
  const payload = buildFeedbackPayload({ appRating: 4, umpireRatings: {} })
  assert.deepEqual(payload, { appRating: 4 })
})

test('buildFeedbackPayload includes comments only when their rating is present', () => {
  const payload = buildFeedbackPayload({ groundRating: 5, groundLiked: 'Great pitch', appRating: null })
  assert.deepEqual(payload, { groundRating: 5, groundCommentLiked: 'Great pitch' })
})

test('buildFeedbackPayload filters out umpires with no rating set and keeps only rated ones', () => {
  const payload = buildFeedbackPayload({
    umpireRatings: {
      101: { rating: 5, liked: 'Fair decisions' },
      102: { rating: null },
      103: { rating: 3 },
    },
  })
  assert.deepEqual(payload.umpireRatings, [
    { umpireUserId: 101, rating: 5, commentLiked: 'Fair decisions' },
    { umpireUserId: 103, rating: 3 },
  ])
})

test('hasAnyRating is true if any of ground/app/umpire ratings are present', () => {
  assert.equal(hasAnyRating({}), false)
  assert.equal(hasAnyRating({ groundRating: 4 }), true)
  assert.equal(hasAnyRating({ appRating: 4 }), true)
  assert.equal(hasAnyRating({ umpireRatings: [{ umpireUserId: 1, rating: 5 }] }), true)
  assert.equal(hasAnyRating({ umpireRatings: [] }), false)
})

test('APP_FEATURES is a fixed, non-empty list of {value,label} matching the backend taxonomy', () => {
  assert.ok(APP_FEATURES.length > 0)
  for (const f of APP_FEATURES) {
    assert.equal(typeof f.value, 'string')
    assert.equal(typeof f.label, 'string')
  }
  assert.ok(APP_FEATURES.some((f) => f.value === 'other'))
})
