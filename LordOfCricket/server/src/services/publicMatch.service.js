// Phase 10 Part 1 — public match discovery read model. PostgreSQL cache
// columns -> buildMatchCard (pure domain) -> lightweight card DTO. No
// independent cricket truth, no replay per card (Part 65/35): match.model.js's
// listMatchesForDiscovery reads the same innings.runs/wickets/legal_balls
// cache the replay engine already maintains.

import * as matchModel from '../models/match.model.js'
import { buildMatchCard } from '../domain/matchDiscovery/buildMatchCard.js'
import { CATEGORY_CONFIG, isValidCategory, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, HOME_UPCOMING_LIMIT, HOME_RESULTS_LIMIT } from '../domain/matchDiscovery/categoryMapping.js'

function badRequest(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

export async function listPublicMatches({ category, limit, offset, teamId = null } = {}) {
  if (!category) throw badRequest('category query parameter is required (LIVE, UPCOMING, or RESULTS).')
  const cat = String(category).toUpperCase()
  if (!isValidCategory(cat)) throw badRequest(`Unknown category '${category}'. Supported: LIVE, UPCOMING, RESULTS.`)

  const clampedLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT))
  const clampedOffset = Math.max(0, Number.isFinite(offset) ? Math.trunc(offset) : 0)

  const { statuses, order } = CATEGORY_CONFIG[cat]
  const { rows, total } = await matchModel.listMatchesForDiscovery({ statuses, order, limit: clampedLimit, offset: clampedOffset, teamId })

  return {
    category: cat,
    pagination: { limit: clampedLimit, offset: clampedOffset, total },
    items: rows.map(buildMatchCard),
  }
}

/** Bounded homepage preview read model (Part 32/33/78): one featured live
 * match, a few upcoming fixtures, a few recent results — never a dumping
 * ground of full lists. */
export async function getHomeDiscovery() {
  const [live, upcoming, results] = await Promise.all([
    listPublicMatches({ category: 'LIVE', limit: 1, offset: 0 }),
    listPublicMatches({ category: 'UPCOMING', limit: HOME_UPCOMING_LIMIT, offset: 0 }),
    listPublicMatches({ category: 'RESULTS', limit: HOME_RESULTS_LIMIT, offset: 0 }),
  ])
  return {
    featuredLiveMatch: live.items[0] || null,
    upcomingMatches: upcoming.items,
    recentResults: results.items,
  }
}
