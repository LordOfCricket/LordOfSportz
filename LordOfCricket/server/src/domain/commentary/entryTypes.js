// Phase 12 — small, closed taxonomy (Part 6: "do not create hundreds of
// types"). Secondary classification lives in `tags` on each entry, not in a
// growing list of types.
export const COMMENTARY_TYPES = Object.freeze([
  'DELIVERY',
  'WICKET',
  'MILESTONE',
  'OVER_END',
  'INNINGS_END',
  'INNINGS_BREAK',
  'MATCH_RESULT',
  'MATCH_EVENT',
])
