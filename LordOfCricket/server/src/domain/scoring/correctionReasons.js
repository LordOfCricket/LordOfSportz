// Canonical correction reason codes — kept in sync by hand with the CHECK
// constraint on score_corrections.reason_code in schema.sql, same tradeoff as
// eventTypes.js (extensibility over a Postgres ENUM's rigidity).
export const CORRECTION_REASON_CODES = Object.freeze([
  'WRONG_RUNS',
  'WRONG_EXTRA',
  'WRONG_WICKET',
  'WRONG_BATSMAN',
  'WRONG_BOWLER',
  'WRONG_FIELDER',
  'WRONG_SHOT',
  'ACCIDENTAL_DELIVERY',
  'MISSED_DELIVERY',
  'UNDO',
  'OTHER',
])
