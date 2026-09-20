// Amenities Master (Super Admin CMS) — the only icons a catalog entry may
// use. `amenity_catalog.icon` is rendered client-side by resolving this
// string against lucide-react's export table (icons[name]) — see
// client/src/components/common/AmenityIcon.jsx — so it must be a real,
// known, curated icon name, never arbitrary user input. Every name here is
// verified to exist in the project's installed lucide-react version. The
// first 10 are the existing seeded amenities (schema.sql); the rest cover
// common cricket-ground facilities a Super Admin is likely to add next.
export const AMENITY_ICON_ALLOW_LIST = Object.freeze([
  'Bath', 'Wifi', 'ParkingSquare', 'UtensilsCrossed', 'Lightbulb',
  'Camera', 'Target', 'DoorOpen', 'GlassWater', 'Building2',
  'Dumbbell', 'Sofa', 'ShowerHead', 'ShieldCheck', 'Trees',
  'Car', 'Zap', 'Wind', 'Users', 'Trophy',
  'Umbrella', 'Music', 'Store', 'Bike', 'Accessibility',
  'Stethoscope', 'FireExtinguisher', 'Refrigerator', 'Coffee', 'Tv',
  'BatteryCharging', 'Ticket', 'MapPin',
])

export function isAllowedAmenityIcon(icon) {
  return AMENITY_ICON_ALLOW_LIST.includes(icon)
}
