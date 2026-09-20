import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateBadges, BADGE_RULES } from './badges.js'

test('evaluateBadges: a brand-new umpire with no history earns zero badges', () => {
  assert.deepEqual(evaluateBadges(), [])
  assert.deepEqual(evaluateBadges({ reliability: null, matchesOfficiated: 0, ratingAvg: null, ratingCount: 0 }), [])
})

test('evaluateBadges: HIGHLY_RELIABLE requires both the reliability floor AND the minimum-sample floor', () => {
  assert.deepEqual(evaluateBadges({ reliability: 100, matchesOfficiated: 1 }), [], 'one perfect match must not earn it — sample too small')
  assert.ok(
    !evaluateBadges({ reliability: 94, matchesOfficiated: 50 }).includes('HIGHLY_RELIABLE'),
    'below the reliability threshold, no matter how many matches (EXPERIENCED_OFFICIAL may still independently apply at 50 matches)',
  )
  assert.deepEqual(evaluateBadges({ reliability: 95, matchesOfficiated: 10 }), ['HIGHLY_RELIABLE'], 'exactly at both floors — inclusive boundary')
})

test('evaluateBadges: TOP_RATED requires both the rating floor AND the minimum-review floor', () => {
  assert.deepEqual(evaluateBadges({ ratingAvg: 5.0, ratingCount: 1 }), [], 'a single 5-star review must not read as Top Rated')
  assert.deepEqual(evaluateBadges({ ratingAvg: 4.5, ratingCount: 50 }), [], 'below the rating threshold, no matter how many reviews')
  assert.deepEqual(evaluateBadges({ ratingAvg: 4.7, ratingCount: 10 }), ['TOP_RATED'], 'exactly at both floors — inclusive boundary')
})

test('evaluateBadges: EXPERIENCED_OFFICIAL is a single officiated-count floor', () => {
  assert.deepEqual(evaluateBadges({ matchesOfficiated: 49 }), [])
  assert.deepEqual(evaluateBadges({ matchesOfficiated: 50 }), ['EXPERIENCED_OFFICIAL'])
})

test('evaluateBadges: an established umpire (the brief\'s own worked example) earns all three, in deterministic order', () => {
  const badges = evaluateBadges({ reliability: 96, matchesOfficiated: 126, ratingAvg: 4.8, ratingCount: 126 })
  assert.deepEqual(badges, ['HIGHLY_RELIABLE', 'TOP_RATED', 'EXPERIENCED_OFFICIAL'])
})

test('evaluateBadges: never treats null reliability/rating as 0 — no fabricated signal for someone with no data', () => {
  assert.deepEqual(evaluateBadges({ reliability: null, matchesOfficiated: 200, ratingAvg: null, ratingCount: 0 }), ['EXPERIENCED_OFFICIAL'], 'officiated count alone is still real data, but reliability/rating badges require their own real numbers')
})

test('BADGE_RULES is frozen and exposes exactly the 3 documented badges', () => {
  assert.deepEqual(Object.keys(BADGE_RULES), ['HIGHLY_RELIABLE', 'TOP_RATED', 'EXPERIENCED_OFFICIAL'])
  assert.ok(Object.isFrozen(BADGE_RULES))
})
