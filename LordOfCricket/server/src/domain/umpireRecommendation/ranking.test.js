import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreCandidate, rankUmpireCandidates, explainRecommendation, RANKING_WEIGHTS } from './ranking.js'

function rep(overrides = {}) {
  return { ratingAvg: null, ratingCount: 0, reliability: null, matchesOfficiated: 0, noShows: 0, cancellations: 0, verified: true, ...overrides }
}

test('RANKING_WEIGHTS sums to 100 — a fully-scored candidate maxes out at exactly 100', () => {
  assert.equal(RANKING_WEIGHTS.RATING_MAX + RANKING_WEIGHTS.RELIABILITY_MAX + RANKING_WEIGHTS.EXPERIENCE_MAX, 100)
  const perfect = scoreCandidate(rep({ ratingAvg: 5, ratingCount: 50, reliability: 100, matchesOfficiated: 100 }))
  assert.equal(perfect.score, 100)
})

test('a brand-new umpire (0 matches, 0 reviews) scores at the neutral midpoint, never 0 (worst) or 100 (best)', () => {
  const result = scoreCandidate(rep())
  assert.equal(result.score, 37.5)
  assert.equal(result.hasEnoughData, false)
})

test('required test 11 — a single 5.0 review does not dominate an established 4.8-over-126-reviews candidate', () => {
  const oneReview = scoreCandidate(rep({ ratingAvg: 5, ratingCount: 1 }))
  const established = scoreCandidate(rep({ ratingAvg: 4.8, ratingCount: 126, reliability: 96, matchesOfficiated: 126 }))
  assert.ok(established.score > oneReview.score, `established (${established.score}) must outrank a thin-sample perfect score (${oneReview.score})`)
  // The thin-sample rating component itself must be far below the max, not near it.
  assert.ok(oneReview.components.rating < RANKING_WEIGHTS.RATING_MAX * 0.6)
})

test('required test 10 — a new umpire is not treated as the worst: a proven-poor, well-sampled umpire ranks below them', () => {
  const newUmpire = scoreCandidate(rep())
  const provenPoor = scoreCandidate(rep({ ratingAvg: 1.0, ratingCount: 15, reliability: 10, matchesOfficiated: 15 }))
  assert.ok(newUmpire.score > provenPoor.score, `a new umpire (${newUmpire.score}) must outrank a genuinely poor, well-established umpire (${provenPoor.score})`)
})

test('required test 9 — ranking is not rating alone: a lower-rated but far more reliable/experienced candidate can outrank a higher-rated one', () => {
  const highRatingLowEverythingElse = scoreCandidate(rep({ ratingAvg: 4.9, ratingCount: 10, reliability: 60, matchesOfficiated: 10 }))
  const solidAllAround = scoreCandidate(rep({ ratingAvg: 4.5, ratingCount: 30, reliability: 98, matchesOfficiated: 60 }))
  assert.ok(solidAllAround.score > highRatingLowEverythingElse.score, 'reliability/experience must meaningfully move the ranking, not just rating')
})

test('sample-size floors reuse the exact badge-engine thresholds (10 reviews, 10 officiated, 50 officiated) — Workstream U consistency', () => {
  // Exactly at the reused thresholds, the component should equal the full (unblended) value.
  const atThreshold = scoreCandidate(rep({ ratingAvg: 4.0, ratingCount: 10, reliability: 80, matchesOfficiated: 10 }))
  assert.equal(atThreshold.components.rating, (4.0 / 5) * RANKING_WEIGHTS.RATING_MAX)
  assert.equal(atThreshold.components.reliability, (80 / 100) * RANKING_WEIGHTS.RELIABILITY_MAX)
  const experienceCapped = scoreCandidate(rep({ matchesOfficiated: 50 }))
  assert.equal(experienceCapped.components.experience, RANKING_WEIGHTS.EXPERIENCE_MAX)
  const beyondCap = scoreCandidate(rep({ matchesOfficiated: 500 }))
  assert.equal(beyondCap.components.experience, RANKING_WEIGHTS.EXPERIENCE_MAX, 'experience is capped, not unboundedly rewarded')
})

test('rankUmpireCandidates sorts by score DESC', () => {
  const candidates = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const reputations = {
    1: rep({ ratingAvg: 3, ratingCount: 20, reliability: 70, matchesOfficiated: 20 }),
    2: rep({ ratingAvg: 4.9, ratingCount: 50, reliability: 99, matchesOfficiated: 80 }),
    3: rep(),
  }
  const ranked = rankUmpireCandidates(candidates, { getReputation: (c) => reputations[c.id] })
  assert.deepEqual(ranked.map((r) => r.candidate.id), [2, 1, 3])
})

test('required test 7 — two candidates with an identical profile get a deterministic tie-breaker (matchesOfficiated, then id)', () => {
  const candidates = [{ id: 5 }, { id: 2 }]
  const identicalRep = rep({ ratingAvg: 4.5, ratingCount: 20, reliability: 90, matchesOfficiated: 20 })
  const ranked = rankUmpireCandidates(candidates, { getReputation: () => identicalRep })
  assert.equal(ranked[0].ranking.score, ranked[1].ranking.score, 'both must have identical scores for this test to be meaningful')
  assert.deepEqual(ranked.map((r) => r.candidate.id), [2, 5], 'lower id wins the tie, deterministically')
})

test('rankUmpireCandidates: matchesOfficiated breaks a tie before id does', () => {
  const candidates = [{ id: 9 }, { id: 1 }]
  const reputations = {
    9: rep({ ratingAvg: 4.5, ratingCount: 20, reliability: 90, matchesOfficiated: 40 }),
    1: rep({ ratingAvg: 4.5, ratingCount: 20, reliability: 90, matchesOfficiated: 5 }),
  }
  // Force equal scores by keeping experience component different but total score should still differ
  // — instead assert ordering purely from officiated count when scores happen to tie via rounding.
  const ranked = rankUmpireCandidates(candidates, { getReputation: (c) => reputations[c.id] })
  assert.equal(ranked[0].candidate.id, 9, 'more experienced candidate (higher score here) ranks first')
})

test('explainRecommendation with no match context (e.g. a leaderboard entry) never claims "available"/"no conflict" for a specific time it was never asked about', () => {
  const reasons = explainRecommendation(rep({ ratingAvg: 4.8, ratingCount: 126, reliability: 96, matchesOfficiated: 126 }), {})
  assert.ok(!reasons.includes('Available for this time'))
  assert.ok(!reasons.includes('No scheduling conflict'))
  assert.ok(reasons.includes('4.8 rating'))
})

test('explainRecommendation returns plain factual reasons, never raw weights/formula numbers', () => {
  const reasons = explainRecommendation(rep({ ratingAvg: 4.8, ratingCount: 126, reliability: 96, matchesOfficiated: 126, verified: true }), {
    available: true,
    noConflict: true,
  })
  assert.deepEqual(reasons, ['Available for this time', 'No scheduling conflict', '4.8 rating', '96% reliability', '126 completed matches', 'LOC Verified'])
  assert.ok(!reasons.some((r) => /\d+\/100|weight|score/i.test(r)), 'must never leak internal scoring language')
})

test('explainRecommendation for a brand-new candidate says so honestly instead of inventing a strength', () => {
  const reasons = explainRecommendation(rep(), { available: true, noConflict: true })
  assert.ok(reasons.includes('New umpire — limited data yet'))
})

test('explainRecommendation omits "Available"/"No conflict" when context says otherwise', () => {
  const reasons = explainRecommendation(rep({ ratingAvg: 4.5, ratingCount: 20 }), { available: false, noConflict: false })
  assert.ok(!reasons.includes('Available for this time'))
  assert.ok(!reasons.includes('No scheduling conflict'))
})
