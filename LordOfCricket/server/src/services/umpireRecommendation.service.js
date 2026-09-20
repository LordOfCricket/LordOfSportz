import { findMatchById } from '../models/match.model.js'
import { findEligibleUmpireCandidates } from './umpireEligibility.service.js'
import { buildReputationSummaries } from './umpireReputation.service.js'
import { rankUmpireCandidates, explainRecommendation } from '../domain/umpireRecommendation/ranking.js'

// Umpire Intelligence & Scale 2.0, Workstreams C/F/O/P/V — "Recommended
// Umpires" for a Ground Owner looking at a specific match. Never assigns
// anybody; purely informational, same posture as listEligibleReplacements.
//
// Same 4-line ownership check every other ground-owner-scoped service
// function in this codebase re-implements locally (groundOwner.service.js's
// own resolveOwnedMatch, matchAccess.service.js's resolveSenderRole) rather
// than importing across service files — `ground` is always the already-
// authorized row requireGroundRole resolved from the URL, never client
// input.
function notFound(message) {
  const err = new Error(message)
  err.statusCode = 404
  return err
}

async function resolveOwnedMatch(ground, matchId) {
  const match = await findMatchById(matchId)
  if (!match || match.ground_id !== ground.id) {
    throw notFound('Match not found for this ground.')
  }
  return match
}

const DEFAULT_LIMIT = 5

/**
 * recommendUmpiresForMatch(ground, matchId, { limit }) -> ranked candidates
 * with reasons, top `limit` first. Every candidate here has ALREADY passed
 * the hard eligibility gate (approved, no conflict, available) — this never
 * shows someone who couldn't actually take the match (Workstream F).
 */
export async function recommendUmpiresForMatch(ground, matchId, { limit = DEFAULT_LIMIT } = {}) {
  const match = await resolveOwnedMatch(ground, matchId)
  const eligible = await findEligibleUmpireCandidates(match)

  const summaries = await buildReputationSummaries(eligible.map((c) => c.id))
  const ranked = rankUmpireCandidates(eligible, { getReputation: (c) => summaries.get(c.id) })

  return ranked.slice(0, limit).map(({ candidate, reputation, ranking }) => ({
    id: candidate.id,
    name: candidate.name,
    reputation,
    hasEnoughData: ranking.hasEnoughData,
    reasons: explainRecommendation(reputation, { available: true, noConflict: true }),
  }))
}
