// Deterministic, explainable reliability score — pure, zero-I/O. Recomputed
// from raw event counts every time it's requested (same "cached aggregate,
// always recomputable from source" convention ratingAggregation.service.js
// already established for star ratings), never stored as the source of
// truth itself. Only real recorded events feed it: completed assignments
// (the umpire actually officiated), no-shows, and cancellations — no
// invented weighting beyond a plain completed/(completed+noShows+
// cancellations) ratio.
export function computeReliability({ completed = 0, noShows = 0, cancellations = 0 } = {}) {
  const terminal = completed + noShows + cancellations
  if (terminal === 0) return null // no terminal history yet — "not available", never a fabricated number
  return Math.round((completed / terminal) * 100)
}
