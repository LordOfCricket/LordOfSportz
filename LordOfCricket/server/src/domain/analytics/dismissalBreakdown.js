// Phase 17 — dismissal-type breakdown, built directly off the authoritative
// `wickets.dismissal_type` column (never inferred from commentary text — see
// docs/ARCHITECTURE.md's Phase 17 section for why that's safe: dismissal type
// is 1:1-FK'd authoritative input, commentary is documented as a projection,
// never a second truth).

const LABELS = {
  bowled: 'Bowled',
  caught: 'Caught',
  lbw: 'LBW',
  'run-out': 'Run Out',
  stumped: 'Stumped',
  'hit-wicket': 'Other',
  'obstructing-field': 'Other',
  'hit-ball-twice': 'Other',
  'timed-out': 'Other',
  'retired-out': 'Other',
}

/** `dismissalTypeRows`: [{dismissal_type}], sorted most-common-first. */
export function buildDismissalBreakdown(dismissalTypeRows) {
  const counts = new Map()
  for (const row of dismissalTypeRows) {
    const label = LABELS[row.dismissal_type] || 'Other'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
}
