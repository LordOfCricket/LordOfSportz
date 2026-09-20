import { findApprovedUmpires } from '../models/umpireRequest.model.js'
import { buildReputationSummaries } from './umpireReputation.service.js'
import { rankUmpireCandidates, explainRecommendation } from '../domain/umpireRecommendation/ranking.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// Umpire Intelligence & Scale 2.0, Workstreams T/U — "Top Umpires",
// deliberately separate from player leaderboards (never merged into
// statistics.service.js#getLeaderboard's metric space). Ranked by the SAME
// deterministic model recommendations use, not raw rating — badge/ranking
// consistency (Workstream U) means "Top Rated" and "ranks well" can never
// silently disagree about what a good umpire looks like.
export async function getTopUmpires({ limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const boundedLimit = Math.min(Math.max(1, limit), MAX_LIMIT)
  const boundedOffset = Math.max(0, offset)

  const candidates = await findApprovedUmpires()
  const summaries = await buildReputationSummaries(candidates.map((c) => c.id))
  const ranked = rankUmpireCandidates(candidates, { getReputation: (c) => summaries.get(c.id) })

  const page = ranked.slice(boundedOffset, boundedOffset + boundedLimit)
  return {
    items: page.map(({ candidate, reputation, ranking }, index) => ({
      rank: boundedOffset + index + 1,
      id: candidate.id,
      name: candidate.name,
      reputation,
      hasEnoughData: ranking.hasEnoughData,
      reasons: explainRecommendation(reputation, {}),
    })),
    total: ranked.length,
    limit: boundedLimit,
    offset: boundedOffset,
  }
}
