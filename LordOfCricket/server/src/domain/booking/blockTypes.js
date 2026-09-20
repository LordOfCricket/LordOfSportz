// Phase 18 Feature 3/15 — the named ground-block/maintenance taxonomy.
// Deliberately one shared list: "Electrical Work"/"Pitch Rolling"/"Pitch
// Watering" appear verbatim in both the Ground Blocks and Maintenance
// Scheduler feature lists, so a single enum naturally covers both rather than
// two overlapping ones.

export const GROUND_BLOCK_TYPES = Object.freeze({
  GRASS_MAINTENANCE: 'Grass Maintenance',
  PITCH_MAINTENANCE: 'Pitch Maintenance',
  CLEANING: 'Cleaning',
  ELECTRICAL_WORK: 'Electrical Work',
  WATER_MAINTENANCE: 'Water Maintenance',
  PITCH_ROLLING: 'Pitch Rolling',
  PITCH_WATERING: 'Pitch Watering',
  PRIVATE_EVENT: 'Private Event',
  FESTIVAL: 'Festival',
  RAIN: 'Rain',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
})

export function isValidBlockType(type) {
  return Object.prototype.hasOwnProperty.call(GROUND_BLOCK_TYPES, type)
}

export function blockTypeLabel(type) {
  return GROUND_BLOCK_TYPES[type] || type
}
