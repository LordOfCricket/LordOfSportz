// Pure helpers for the "My Statistics" umpire page — no fetching here (the
// hook owns that), mirrors umpireDashboard.model.js's convention. Both
// helpers work directly off the raw GET /umpire/assignments response
// (models/matchUmpireSlot.model.js::findSlotsForUmpire on the backend) —
// no new endpoint, no fabricated numbers.

// "Matches This Month" — assignments the umpire currently holds or has
// completed (status='ASSIGNED' or 'COMPLETED'; a CANCELLED/NO_SHOW slot
// isn't a match they're officiating), whose match falls in the current
// calendar month, since the point is recency of activity. 'COMPLETED' as
// well as 'ASSIGNED': the instant a match completes, its slot
// transitions ASSIGNED -> COMPLETED (officiating credit) — without this, a
// match this umpire officiated earlier this month would drop out of the
// count the moment it finished, which is backwards for "activity this month".
export function matchesThisMonth(assignments, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  return (assignments || []).filter((a) => {
    if (a.status !== 'ASSIGNED' && a.status !== 'COMPLETED') return false
    const matchDate = new Date(a.match_date)
    return matchDate.getFullYear() === year && matchDate.getMonth() === month
  }).length
}

// "Grounds Officiated At" — distinct grounds where a slot this umpire held
// has reached 'COMPLETED' (written the instant its match
// completes — genuinely officiated, not merely "currently holding a slot on
// an upcoming match"). Checking status alone is now sufficient and more
// precise than the old ASSIGNED + match_status-in-completed/finalized
// combination, which (now that COMPLETED is real) can never both be true at
// once — a slot is never simultaneously ASSIGNED and on a completed match.
export function groundsOfficiatedAt(assignments) {
  const grounds = new Set((assignments || []).filter((a) => a.status === 'COMPLETED' && a.ground_name).map((a) => a.ground_name))
  return grounds.size
}

// "Matches in Last N Months" — same ASSIGNED/COMPLETED officiating-credit
// rule as matchesThisMonth, generalized to the N full calendar months
// immediately preceding the current one (deliberately excludes the current,
// still-in-progress month — that's what the separate "This Month" tile is
// for). Used for "Last Month" (n=1) and "Last 3 Months" (n=3) activity
// tiles. Entirely client-side, to avoid ever introducing a new server-side
// NOW()/date comparison (see reliability.js's history with matches.match_date
// timezone issues last phase).
export function matchesInLastNMonths(assignments, n, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - n, 1).getTime()
  const end = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  return (assignments || []).filter((a) => {
    if (a.status !== 'ASSIGNED' && a.status !== 'COMPLETED') return false
    const matchDateMs = new Date(a.match_date).getTime()
    return matchDateMs >= start && matchDateMs < end
  }).length
}
