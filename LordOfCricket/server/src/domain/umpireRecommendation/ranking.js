import { BADGE_RULES } from '../umpireReputation/badges.js'

// Umpire Intelligence & Scale 2.0 — pure, zero-I/O, deterministic ranking of
// eligible umpire candidates. Never touches the network/DB; every input is
// already-computed reputation data (buildReputationSummaries), and every
// candidate scored here has ALREADY passed the hard eligibility gate
// (approved, no conflict, available) — this module only orders survivors,
// it never decides who's eligible.
//
// Deliberately transparent and additive (score = sum of bounded
// components), never a hidden/opaque model. Weights are constants, not
// learned, and are documented right here — not buried in a config file.
// Sample-size floors reuse the EXACT constants the badge engine already
// uses (badges.js#BADGE_RULES), so a "Highly Reliable" badge and a high
// reliabilityComponent can never quietly disagree about what "enough
// sample" means (Workstream U).

export const RANKING_WEIGHTS = Object.freeze({
  RATING_MAX: 40,
  RELIABILITY_MAX: 35,
  EXPERIENCE_MAX: 25,
})

// Reused verbatim from the badge engine — not redefined/duplicated with a
// different number that could quietly drift from what "Top Rated"/"Highly
// Reliable"/"Experienced Official" actually mean.
const RATING_MIN_SAMPLE = BADGE_RULES.TOP_RATED.minReviews // 10
const RELIABILITY_MIN_SAMPLE = BADGE_RULES.HIGHLY_RELIABLE.minOfficiated // 10
const EXPERIENCE_CAP = BADGE_RULES.EXPERIENCED_OFFICIAL.minOfficiated // 50

// A small floor below which a candidate is flagged "not enough data" for
// display purposes (Workstream B) — distinct from the scoring blend itself,
// which already softens thin-sample scores toward neutral rather than
// punishing/rewarding them at the extremes.
const ENOUGH_DATA_FLOOR = 5

// Deterministic shrinkage-to-neutral, NOT Bayesian inference (the task's own
// "simple deterministic... enough" instruction) — a candidate with zero
// sample scores exactly at `neutral` (never assumed best or worst); as
// sample size approaches the reused badge threshold, the score smoothly
// moves toward the real, fully-earned value.
function blend(neutral, full, sampleSize, minSample) {
  const confidence = Math.min(sampleSize / minSample, 1)
  return neutral * (1 - confidence) + full * confidence
}

function ratingComponent(ratingAvg, ratingCount) {
  const neutral = RANKING_WEIGHTS.RATING_MAX / 2
  const full = ratingAvg != null ? (ratingAvg / 5) * RANKING_WEIGHTS.RATING_MAX : neutral
  return blend(neutral, full, ratingCount, RATING_MIN_SAMPLE)
}

function reliabilityComponent(reliability, matchesOfficiated, noShows, cancellations) {
  const terminal = matchesOfficiated + noShows + cancellations
  const neutral = RANKING_WEIGHTS.RELIABILITY_MAX / 2
  const full = reliability != null ? (reliability / 100) * RANKING_WEIGHTS.RELIABILITY_MAX : neutral
  return blend(neutral, full, terminal, RELIABILITY_MIN_SAMPLE)
}

// No confidence-blend here, deliberately: zero completed matches is an
// objective fact (not a thin-sample estimate of some "true" experience
// value), so there is nothing to shrink toward — 0 experience just scores 0
// on this one component, while the OTHER two components (rating/
// reliability) still land at a fair neutral midpoint for a brand-new umpire,
// which is what keeps the total score from reading as "worst" (Workstream Q).
function experienceComponent(matchesOfficiated) {
  return (Math.min(matchesOfficiated, EXPERIENCE_CAP) / EXPERIENCE_CAP) * RANKING_WEIGHTS.EXPERIENCE_MAX
}

/**
 * scoreCandidate(reputation) -> { score, hasEnoughData, components: {rating, reliability, experience} }
 * `reputation` is one entry from buildReputationSummaries: {ratingAvg,
 * ratingCount, reliability, matchesOfficiated, noShows, cancellations, ...}.
 */
export function scoreCandidate(reputation) {
  const { ratingAvg = null, ratingCount = 0, reliability = null, matchesOfficiated = 0, noShows = 0, cancellations = 0 } = reputation || {}

  const rating = ratingComponent(ratingAvg, ratingCount)
  const reliabilityScore = reliabilityComponent(reliability, matchesOfficiated, noShows, cancellations)
  const experience = experienceComponent(matchesOfficiated)

  return {
    score: Math.round((rating + reliabilityScore + experience) * 100) / 100,
    hasEnoughData: matchesOfficiated >= ENOUGH_DATA_FLOOR || ratingCount >= ENOUGH_DATA_FLOOR,
    components: {
      rating: Math.round(rating * 100) / 100,
      reliability: Math.round(reliabilityScore * 100) / 100,
      experience: Math.round(experience * 100) / 100,
    },
  }
}

/**
 * rankUmpireCandidates(candidates, { getReputation }) -> ranked candidates,
 * each with a `.ranking` field attached. `candidates` is any array of
 * objects with a stable `.id`; `getReputation(candidate)` resolves that
 * candidate's already-fetched reputation summary (batched upstream — this
 * function performs no I/O itself). Sorted score DESC, then
 * matchesOfficiated DESC, then id ASC — fully deterministic, so two
 * candidates with an identical profile always come back in the same order.
 */
export function rankUmpireCandidates(candidates, { getReputation }) {
  return candidates
    .map((candidate) => {
      const reputation = getReputation(candidate) || {}
      return { candidate, reputation, ranking: scoreCandidate(reputation) }
    })
    .sort((a, b) => {
      if (b.ranking.score !== a.ranking.score) return b.ranking.score - a.ranking.score
      const officiatedDiff = (b.reputation.matchesOfficiated || 0) - (a.reputation.matchesOfficiated || 0)
      if (officiatedDiff !== 0) return officiatedDiff
      return a.candidate.id - b.candidate.id
    })
}

// Explanation, not weights (Workstream D) — plain factual strings built
// from the same already-computed fields a Ground Owner already sees
// elsewhere (rating/reliability/matches/badges), never a formula/weight
// number. `context` carries match-scoped facts (already verified by the
// eligibility gate) so "Available"/"No conflict" can be stated as fact, not
// re-derived here.
export function explainRecommendation(reputation, context = {}) {
  const reasons = []
  // Opt-in, not opt-out: these two reasons only ever appear when a caller
  // explicitly asserts them for a SPECIFIC match context (the recommendation
  // service, which only ever calls this on candidates that already passed
  // the eligibility gate). A context-free caller (e.g. the leaderboard,
  // which has no specific match in mind) must never see these — there's
  // nothing to be "available for" or "conflict-free" against there.
  if (context.available === true) reasons.push('Available for this time')
  if (context.noConflict === true) reasons.push('No scheduling conflict')
  if (reputation.ratingCount > 0) reasons.push(`${Number(reputation.ratingAvg).toFixed(1)} rating`)
  if (reputation.reliability != null) reasons.push(`${reputation.reliability}% reliability`)
  if (reputation.matchesOfficiated > 0) reasons.push(`${reputation.matchesOfficiated} completed matches`)
  if (reputation.verified) reasons.push('LOC Verified')
  if (!reputation.matchesOfficiated && !reputation.ratingCount) reasons.push('New umpire — limited data yet')
  return reasons
}
