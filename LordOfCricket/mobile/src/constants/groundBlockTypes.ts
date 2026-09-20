// Mirrors server/src/domain/booking/blockTypes.js (GROUND_BLOCK_TYPES). The
// backend validates the key with isValidBlockType; the label is display-only.
export const GROUND_BLOCK_TYPES: { key: string; label: string }[] = [
  { key: 'GRASS_MAINTENANCE', label: 'Grass Maintenance' },
  { key: 'PITCH_MAINTENANCE', label: 'Pitch Maintenance' },
  { key: 'CLEANING', label: 'Cleaning' },
  { key: 'ELECTRICAL_WORK', label: 'Electrical Work' },
  { key: 'WATER_MAINTENANCE', label: 'Water Maintenance' },
  { key: 'PITCH_ROLLING', label: 'Pitch Rolling' },
  { key: 'PITCH_WATERING', label: 'Pitch Watering' },
  { key: 'PRIVATE_EVENT', label: 'Private Event' },
  { key: 'FESTIVAL', label: 'Festival' },
  { key: 'RAIN', label: 'Rain' },
  { key: 'EMERGENCY', label: 'Emergency' },
  { key: 'OTHER', label: 'Other' },
]

export function groundBlockTypeLabel(key: string | null): string | null {
  if (!key) return null
  return GROUND_BLOCK_TYPES.find((t) => t.key === key)?.label ?? key
}
