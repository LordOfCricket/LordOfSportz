import {
  findNearbyGroundsWithUpcomingMatches,
  findGroundsByCityWithUpcomingMatches,
  findAllGroundsWithUpcomingMatches,
  anyActiveGroundNearby,
  anyActiveGroundInCity,
  anyActiveGroundExists,
} from '../models/ground.model.js'
import { findUpcomingMatchesForGrounds, findActiveAssignedMatchesForUmpire } from '../models/matchUmpireSlot.model.js'
import { estimateMatchTimeRange } from '../domain/umpireAssignment/matchTimeRange.js'
import { rangesOverlap } from '../domain/booking/availability.js'

// Groups the batched matches result by ground_id and attaches each
// ground's own slice — plain JS grouping (a Map), not a third query.
// Every ground in `groundRows` already has >=1 upcoming match by
// construction (the model queries' EXISTS filter), so no ground is ever
// dropped here.
function attachMatches(groundRows, matchRows) {
  const byGround = new Map()
  for (const m of matchRows) {
    if (!byGround.has(m.ground_id)) byGround.set(m.ground_id, [])
    byGround.get(m.ground_id).push(m)
  }
  return groundRows.map((g) => ({ ...g, matches: byGround.get(g.id) || [] }))
}

// Read-side echo of the exact same conflict rule applyForSlot enforces
// server-side (same estimateMatchTimeRange/rangesOverlap functions, never
// reimplemented) — lets the discovery UI show "Unavailable — Schedule
// Conflict" instead of a button that would just 409. Purely advisory: a
// stale flag here can never let a bad apply through, since applyForSlot
// re-checks for real, inside its own transaction, regardless of this value.
async function annotateScheduleConflicts(matchRows, userId) {
  const otherAssignments = await findActiveAssignedMatchesForUmpire(userId)
  if (otherAssignments.length === 0) return matchRows.map((m) => ({ ...m, has_schedule_conflict: false }))
  const otherRanges = otherAssignments.map((m) => estimateMatchTimeRange(m))
  return matchRows.map((m) => {
    const range = estimateMatchTimeRange(m)
    const hasConflict = otherRanges.some((other) => rangesOverlap(range.start, range.end, other.start, other.end))
    return { ...m, has_schedule_conflict: hasConflict }
  })
}

export async function findNearbyGroundsForUmpire({ latitude, longitude, radiusKm, limit, offset, userId }) {
  const { rows, total } = await findNearbyGroundsWithUpcomingMatches({ latitude, longitude, radiusKm, limit, offset })
  if (rows.length === 0) {
    const anyGroundsExist = await anyActiveGroundNearby({ latitude, longitude, radiusKm })
    return { grounds: [], total: 0, anyGroundsExist }
  }
  const matchRows = await annotateScheduleConflicts(await findUpcomingMatchesForGrounds(rows.map((g) => g.id), userId), userId)
  return { grounds: attachMatches(rows, matchRows), total, anyGroundsExist: true }
}

export async function findGroundsByCityForUmpire({ city, limit, offset, userId }) {
  const { rows, total } = await findGroundsByCityWithUpcomingMatches({ city, limit, offset })
  if (rows.length === 0) {
    const anyGroundsExist = await anyActiveGroundInCity({ city })
    return { grounds: [], total: 0, anyGroundsExist }
  }
  const matchRows = await annotateScheduleConflicts(await findUpcomingMatchesForGrounds(rows.map((g) => g.id), userId), userId)
  return { grounds: attachMatches(rows, matchRows), total, anyGroundsExist: true }
}

// Default "Grounds for Umpire" view — every ground with an upcoming match,
// unfiltered, so the page has real content the instant it's opened.
export async function findAllGroundsForUmpire({ limit, offset, userId }) {
  const { rows, total } = await findAllGroundsWithUpcomingMatches({ limit, offset })
  if (rows.length === 0) {
    const anyGroundsExist = await anyActiveGroundExists()
    return { grounds: [], total: 0, anyGroundsExist }
  }
  const matchRows = await annotateScheduleConflicts(await findUpcomingMatchesForGrounds(rows.map((g) => g.id), userId), userId)
  return { grounds: attachMatches(rows, matchRows), total, anyGroundsExist: true }
}
