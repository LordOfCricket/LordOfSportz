// Phase 18 Feature 12 — ground utilization. Formula, documented once here
// (the single source of truth — docs/ARCHITECTURE.md references this file):
//
//   utilizedPercentage = (bookedHours + blockedHours + matchHours) / totalHours * 100
//
// `totalHours` is the ground's real open hours for the period (opening hour
// to closing hour, per day, summed across the date range — domain/booking/
// policy.js's GROUND_OPENING_HOUR/GROUND_CLOSING_HOUR, never a fabricated
// 24-hour day). Each category's own percentage is also returned so a caller
// can render a breakdown, not just one blended number.

export function computeUtilization({ totalHours, bookedHours, blockedHours, matchHours }) {
  if (totalHours <= 0) {
    return { totalHours: 0, bookedHours: 0, blockedHours: 0, matchHours: 0, freeHours: 0, bookedPercentage: null, blockedPercentage: null, matchPercentage: null, utilizedPercentage: null }
  }
  const utilizedHours = bookedHours + blockedHours + matchHours
  return {
    totalHours,
    bookedHours,
    blockedHours,
    matchHours,
    freeHours: Math.max(0, totalHours - utilizedHours),
    bookedPercentage: (bookedHours / totalHours) * 100,
    blockedPercentage: (blockedHours / totalHours) * 100,
    matchPercentage: (matchHours / totalHours) * 100,
    utilizedPercentage: (utilizedHours / totalHours) * 100,
  }
}
