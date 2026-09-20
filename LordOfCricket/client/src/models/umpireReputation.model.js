// Pure display helpers for umpire reputation (badges, verification, trend) —
// same "fixed taxonomy, plain label lookup" convention as matchBriefing.model.js.
// Badge keys must match the backend's own BADGE_RULES exactly
// (server/src/domain/umpireReputation/badges.js) — this file only maps a
// key the backend already decided on to a label/short description; it never
// re-derives whether a badge applies.

export const BADGE_LABELS = {
  HIGHLY_RELIABLE: 'Highly Reliable',
  TOP_RATED: 'Top Rated',
  EXPERIENCED_OFFICIAL: 'Experienced Official',
}

export const BADGE_DESCRIPTIONS = {
  HIGHLY_RELIABLE: '95%+ reliability across 10+ officiated matches',
  TOP_RATED: '4.7+ rating from 10+ reviews',
  EXPERIENCED_OFFICIAL: '50+ matches officiated',
}

export function badgeLabel(badgeKey) {
  return BADGE_LABELS[badgeKey] || badgeKey
}

export function badgeDescription(badgeKey) {
  return BADGE_DESCRIPTIONS[badgeKey] || ''
}

// "Not enough data yet" applies to reliability/rating independently — a
// brand-new umpire's reliability being null doesn't mean their rating is
// also unavailable (they're derived from different event streams).
export function experienceLabel(experienceYears) {
  if (experienceYears == null) return null
  if (experienceYears === 0) return 'New'
  return `${experienceYears} Year${experienceYears === 1 ? '' : 's'}`
}

// Rating trend needs at least 2 data points to mean anything as a "trend" —
// a single rating is just a number, not a direction. Never implies
// statistical significance from 1 review (Workstream P).
export function hasEnoughDataForTrend(recentRatings) {
  return (recentRatings?.length || 0) >= 2
}
