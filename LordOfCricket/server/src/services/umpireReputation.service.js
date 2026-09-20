import { findReputationSummaryRows } from '../models/umpireReputation.model.js'
import { computeReliability } from '../domain/umpireAssignment/reliability.js'
import { evaluateBadges } from '../domain/umpireReputation/badges.js'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

// Whole years since first approval — null (not 0) when never approved, so
// the frontend can distinguish "no data" from "brand new, under a year".
function experienceYearsFrom(firstApprovedAt) {
  if (!firstApprovedAt) return null
  return Math.max(0, Math.floor((Date.now() - new Date(firstApprovedAt).getTime()) / MS_PER_YEAR))
}

// A purpose-built projection, not a raw table passthrough — same "100%
// camelCase" convention the existing public player profile
// (statistics.service.js#getPublicPlayerProfile) already established for
// this exact kind of curated summary object.
function toSummary(row) {
  const ratingAvg = row.rating_avg != null ? Number(row.rating_avg) : null
  const ratingCount = row.rating_count ?? 0
  const matchesOfficiated = row.matches_officiated ?? 0
  const noShows = row.no_shows ?? 0
  const cancellations = row.cancellations ?? 0
  // Same shared formula as everywhere else (Operations 2.0) — never
  // recomputed differently here.
  const reliability = computeReliability({ completed: matchesOfficiated, noShows, cancellations })
  const badges = evaluateBadges({ reliability, matchesOfficiated, ratingAvg, ratingCount })

  return {
    userId: row.user_id,
    name: row.name,
    verified: row.verified,
    ratingAvg,
    ratingCount,
    reliability,
    matchesOfficiated,
    noShows,
    cancellations,
    experienceYears: experienceYearsFrom(row.first_approved_at),
    badges,
  }
}

// One batched query for any number of umpires — the shared builder every
// consumer (self profile, ground-owner slots, replacement candidates) goes
// through, so none of them ever fall back to a per-user loop.
export async function buildReputationSummaries(userIds) {
  const uniqueIds = [...new Set(userIds)]
  if (!uniqueIds.length) return new Map()
  const rows = await findReputationSummaryRows(uniqueIds)
  return new Map(rows.map((row) => [row.user_id, toSummary(row)]))
}

export async function buildReputationSummary(userId) {
  const summaries = await buildReputationSummaries([userId])
  return summaries.get(userId) || null
}
