import { findAvailableMatchesForUmpire, findSlotsForUmpire, getUmpireStats } from '../models/matchUmpireSlot.model.js'
import { getOrCreateUmpireProfile, updateUmpireProfile } from '../models/umpireProfile.model.js'
import {
  findWeeklyAvailability,
  findDateAvailability,
  upsertWeeklyAvailability,
  upsertDateAvailability,
  deleteDateAvailability,
} from '../models/umpireAvailability.model.js'
import { findRecentRatingsForUmpire } from '../models/matchFeedback.model.js'
import { findMonthlyOfficiatingTrend } from '../models/umpireTrend.model.js'
import { computeReliability } from '../domain/umpireAssignment/reliability.js'
import { buildReputationSummary } from './umpireReputation.service.js'

export async function listAvailableMatches() {
  return findAvailableMatchesForUmpire()
}

export async function listMyAssignments(userId) {
  return findSlotsForUmpire(userId)
}

// Reliability is always recomputed from the raw stats, never itself stored
// (same "recompute from source, never cache the derived number" convention
// ratingAggregation.service.js established for star ratings) — deterministic
// and explainable, per Workstream K's own requirement.
function withReliability(stats) {
  return { ...stats, reliability: computeReliability({ completed: stats.matches_officiated, noShows: stats.matches_no_show, cancellations: stats.matches_cancelled }) }
}

// Phase 24 — verified/experienceYears/badges come from the SAME shared
// buildReputationSummary every other reputation surface uses (ground-owner
// slots, replacement candidates), never a second implementation. Its own
// ratingAvg/matchesOfficiated/reliability fields are deliberately NOT
// merged in here — this endpoint already has those under their existing
// snake_case keys (profile/stats above); re-adding them under different
// keys would risk two independently-computed numbers silently drifting.
// recentRatings: newest-first from the DB, reversed to chronological
// (oldest -> newest) to match the brief's own trend-reading direction.
async function withReputation(userId) {
  const [summary, recentRatingsDesc] = await Promise.all([buildReputationSummary(userId), findRecentRatingsForUmpire(userId, 5)])
  return {
    verified: summary?.verified ?? false,
    experienceYears: summary?.experienceYears ?? null,
    badges: summary?.badges ?? [],
    recentRatings: recentRatingsDesc
      .slice()
      .reverse()
      .map((r) => ({ rating: r.rating, createdAt: r.created_at })),
  }
}

export async function getMyProfile(userId) {
  const [profile, stats, reputation] = await Promise.all([getOrCreateUmpireProfile(userId), getUmpireStats(userId), withReputation(userId)])
  return { ...profile, ...withReliability(stats), ...reputation }
}

export async function updateMyProfile(userId, fields) {
  const [profile, stats, reputation] = await Promise.all([updateUmpireProfile(userId, fields), getUmpireStats(userId), withReputation(userId)])
  return { ...profile, ...withReliability(stats), ...reputation }
}

// Umpire Intelligence & Scale 2.0, Workstreams G/H — its own endpoint
// (not merged into getMyProfile) since it's a heavier, less-frequently-
// needed payload than the profile fetch every dashboard page already makes.
export async function getMyOfficiatingTrend(userId, months = 6) {
  const trendMonths = await findMonthlyOfficiatingTrend(userId, months)
  return { months: trendMonths }
}

export async function getMyAvailability(userId) {
  const [weekly, dateOverrides] = await Promise.all([findWeeklyAvailability(userId), findDateAvailability(userId)])
  return { weekly, dateOverrides }
}

export async function setWeeklyAvailability(userId, dayOfWeek, isAvailable) {
  return upsertWeeklyAvailability(userId, dayOfWeek, isAvailable)
}

export async function setDateAvailability(userId, fields) {
  return upsertDateAvailability(userId, fields)
}

export async function removeDateAvailability(userId, specificDate) {
  await deleteDateAvailability(userId, specificDate)
}
