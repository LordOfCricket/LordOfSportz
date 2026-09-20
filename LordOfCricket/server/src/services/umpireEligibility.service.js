import { findApprovedUmpires } from '../models/umpireRequest.model.js'
import { findActiveAssignedMatchesForUmpire, hasActiveSlotAssignment } from '../models/matchUmpireSlot.model.js'
import { findWeeklyAvailability, findDateAvailability } from '../models/umpireAvailability.model.js'
import { estimateMatchTimeRange } from '../domain/umpireAssignment/matchTimeRange.js'
import { rangesOverlap } from '../domain/booking/availability.js'
import { isUmpireAvailableForMatch } from '../domain/umpireAssignment/availability.js'

// Umpire Intelligence & Scale 2.0 — extracted, behavior-preserving, from
// groundOwner.service.js#listEligibleReplacements (Phase 23/24), so the new
// recommendation engine (Workstream O/C/F) reuses the exact same
// eligibility pipeline instead of re-deriving it: approved, not already
// holding an active slot on THIS match, no schedule conflict with the
// candidate's OTHER active assignments, and available per their own
// weekly/date rules. `listEligibleReplacements` itself now calls this
// function — its own behavior is unchanged, only where the logic lives.
//
// Concurrent across candidates (Promise.all) — the Phase 24 N+1 fix,
// preserved here rather than reintroduced.
export async function findEligibleUmpireCandidates(match, { excludeUserId = null } = {}) {
  const candidates = await findApprovedUmpires()
  const candidateRange = estimateMatchTimeRange(match)

  const checked = await Promise.all(
    candidates.map(async (candidate) => {
      if (excludeUserId != null && candidate.id === excludeUserId) return null
      if (await hasActiveSlotAssignment(match.id, candidate.id)) return null

      const otherAssignments = await findActiveAssignedMatchesForUmpire(candidate.id, match.id)
      const conflict = otherAssignments.some((other) => {
        const otherRange = estimateMatchTimeRange(other)
        return rangesOverlap(candidateRange.start, candidateRange.end, otherRange.start, otherRange.end)
      })
      if (conflict) return null

      const [weeklyRules, dateOverrides] = await Promise.all([findWeeklyAvailability(candidate.id), findDateAvailability(candidate.id)])
      if (!isUmpireAvailableForMatch(candidateRange, weeklyRules, dateOverrides)) return null

      return candidate
    }),
  )
  return checked.filter(Boolean)
}
