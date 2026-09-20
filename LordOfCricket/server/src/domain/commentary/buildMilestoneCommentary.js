// Deterministic milestone prose (Part 19/21/22) — crossing detection itself
// lives in generateInningsCommentary.js (it needs before/after replay state);
// these are pure text builders only.

export function buildBatsmanMilestoneText(playerName, threshold) {
  if (threshold === 50) return `FIFTY! ${playerName} reaches his half-century.`
  if (threshold === 100) return `HUNDRED! A magnificent century for ${playerName}.`
  return null
}

export function buildBowlerMilestoneText(playerName, wickets) {
  if (wickets === 3) return `Three wickets for ${playerName}.`
  if (wickets === 5) return `Five wickets for ${playerName}!`
  return null
}

export function buildPartnershipMilestoneText(namesJoined, threshold) {
  if (threshold === 50) return `Fifty partnership between ${namesJoined}.`
  if (threshold === 100) return `Hundred partnership between ${namesJoined}.`
  return null
}

/** True the instant `after` crosses `threshold` and `before` had not yet — the
 * ONE moment a milestone is announced (Part 20), never re-announced on a
 * later ball just because the total still exceeds it. */
export function crossedThreshold(before, after, threshold) {
  return before < threshold && after >= threshold
}
