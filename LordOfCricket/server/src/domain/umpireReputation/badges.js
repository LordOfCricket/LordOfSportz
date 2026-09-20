// Umpire reputation badges (Phase 24, Workstreams G/H) — pure, zero-I/O,
// same "domain is pure" convention as domain/umpireAssignment. Badges are
// NEVER stored; they're recomputed live from real reliability/rating/match
// counts every time a profile/summary is built (service layer's job), so
// there is no cache to go stale and nothing to "recompute" on demand — it's
// always already current.
//
// Exactly the 3 badges shown in the product brief's own headline example
// (Highly Reliable, Top Rated, Experienced Official) — deliberately not a
// 4th/5th "Active"/"Veteran" tier, which would read as gamification rather
// than a clear trust signal. Each rule pairs its real threshold with an
// explicit MINIMUM SAMPLE SIZE floor (Workstream P) so a single lucky match
// or a single 5-star review can never earn a badge that's supposed to mean
// "sustained, real reputation" — reliability/rating themselves are never
// gated this way (the raw numbers stay honest, per Workstream E's "preserve
// the formula" instruction); the floor lives here, at the badge layer, only.
export const BADGE_RULES = Object.freeze({
  HIGHLY_RELIABLE: Object.freeze({ minReliability: 95, minOfficiated: 10 }),
  TOP_RATED: Object.freeze({ minRating: 4.7, minReviews: 10 }),
  EXPERIENCED_OFFICIAL: Object.freeze({ minOfficiated: 50 }),
})

/**
 * evaluateBadges({ reliability, matchesOfficiated, ratingAvg, ratingCount })
 * -> string[] of badge keys (subset of Object.keys(BADGE_RULES)), in a
 * fixed, deterministic order. `reliability`/`ratingAvg` may be null (no
 * terminal history / no reviews yet) — never treated as 0, since that would
 * be a fabricated "0% reliable"/"0-star" signal for someone with no data.
 */
export function evaluateBadges({ reliability = null, matchesOfficiated = 0, ratingAvg = null, ratingCount = 0 } = {}) {
  const badges = []

  if (reliability != null && reliability >= BADGE_RULES.HIGHLY_RELIABLE.minReliability && matchesOfficiated >= BADGE_RULES.HIGHLY_RELIABLE.minOfficiated) {
    badges.push('HIGHLY_RELIABLE')
  }
  if (ratingAvg != null && ratingAvg >= BADGE_RULES.TOP_RATED.minRating && ratingCount >= BADGE_RULES.TOP_RATED.minReviews) {
    badges.push('TOP_RATED')
  }
  if (matchesOfficiated >= BADGE_RULES.EXPERIENCED_OFFICIAL.minOfficiated) {
    badges.push('EXPERIENCED_OFFICIAL')
  }

  return badges
}
