import * as icons from 'lucide-react'

// Amenities Master — the single, centralized place an amenity_catalog
// `icon` string (e.g. "Wifi") is resolved to a real lucide-react component.
// Previously copy-pasted independently in AmenityPicker.jsx,
// GroundAmenitiesPage.jsx, and AmenityCatalogGrid.jsx — collapsed into one
// component so a future icon-rendering change (or icon-name typo fix) only
// has to happen once. Falls back to an empty placeholder, never throws, if
// `name` isn't a real export (defensive — shouldn't happen since the
// catalog's `icon` column is server-validated against a fixed allow-list).
export default function AmenityIcon({ name, className }) {
  const Icon = icons[name]
  if (!Icon) return <span className={className} />
  return <Icon className={className} aria-hidden="true" />
}
