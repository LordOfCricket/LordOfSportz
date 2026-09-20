import type { UmpireAssignment } from '../services/umpireApi'

export type AssignmentBucket = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'noShow'

// Mirrors the website's umpireDashboard.model.js#bucketAssignments — an
// ASSIGNED slot follows the match lifecycle; COMPLETED / CANCELLED / NO_SHOW
// are their own buckets regardless of match_status.
export function assignmentBucket(a: UmpireAssignment): AssignmentBucket {
  if (a.status === 'ASSIGNED') {
    if (a.match_status === 'live') return 'live'
    if (a.match_status === 'upcoming') return 'upcoming'
    return 'completed'
  }
  if (a.status === 'CANCELLED') return 'cancelled'
  if (a.status === 'NO_SHOW') return 'noShow'
  return 'completed' // COMPLETED
}

// Mirrors matchTimeRange.js#isAssignmentLocked exactly (24h before kickoff),
// so the UI's "locked" hint can't drift from what the backend enforces.
const LOCK_HOURS = 24

export function isAssignmentLocked(matchDate: string, now: Date = new Date()): boolean {
  const t = new Date(matchDate).getTime()
  if (isNaN(t)) return false
  return t - now.getTime() <= LOCK_HOURS * 60 * 60 * 1000
}
