// Mirrors the region ids in client/src/models/wagonWheel.model.js's FIELD_REGIONS.
// Kept as a flat id list here because the server only needs to validate a
// region_id it's given — the angle-to-region geometry stays a client concern.
export const WAGON_WHEEL_REGION_IDS = Object.freeze([
  'long-on',
  'mid-wicket',
  'square-leg',
  'fine-leg',
  'third-man',
  'point',
  'cover',
  'long-off',
])
