// Prose phrasing for the EXISTING wagon-wheel region ids
// (domain/scoring/wagonWheelRegions.js) — commentary never invents its own
// region geometry, it only turns an already-authoritative region_id into a
// preposition phrase. Two phrasings: a shot found ALONG the ground goes
// "through"/"to" a region; a shot that clears the rope goes "over" one.
const THROUGH_PHRASE = {
  'long-on': 'to long-on',
  'mid-wicket': 'through mid-wicket',
  'square-leg': 'to square leg',
  'fine-leg': 'to fine leg',
  'third-man': 'to third man',
  point: 'to point',
  cover: 'through cover',
  'long-off': 'to long-off',
}

const OVER_PHRASE = {
  'long-on': 'over long-on',
  'mid-wicket': 'over mid-wicket',
  'square-leg': 'over square leg',
  'fine-leg': 'over fine leg',
  'third-man': 'over third man',
  point: 'over point',
  cover: 'over cover',
  'long-off': 'over long-off',
}

/** @param {string|null} regionId @param {{ over?: boolean }} [opts] */
export function regionPhrase(regionId, { over = false } = {}) {
  if (!regionId) return null
  return (over ? OVER_PHRASE : THROUGH_PHRASE)[regionId] || null
}
