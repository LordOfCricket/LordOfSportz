// Pure logic/constants for ground discovery, kept separate from the
// fetching hooks (useGroundSearch.js/useGround.js/useAllGrounds.js) so it's
// testable with the project's one existing test convention (node --test,
// no DOM).
//
// Homepage redesign Stage 1 — GPS geolocation is back as a secondary
// "📍 Find Grounds Near Me" option alongside the primary city selector
// (this session briefly removed it in favor of city-only; this brief
// explicitly asks for both), so the radius/coordinate-validation/
// distance-formatting helpers this file exported before are back too.

export const DEFAULT_PAGE_SIZE = 20

// Mirrors the backend's own radius presets for "Find Grounds Near Me" —
// 5/10/15/25 km, matching the brief's example exactly (was 10/20/50 in an
// earlier iteration of this feature).
export const RADIUS_OPTIONS_KM = [5, 10, 15, 25]
export const DEFAULT_RADIUS_KM = 10

// Grounds page — a draggable km range slider (Flipkart-price-slider style)
// instead of RadiusFilter's discrete buttons. Bounds mirror the backend's
// own radius validation exactly (server/src/controllers/ground.controller.js
// MAX_RADIUS_KM) so the slider can never request a radius the API would
// reject.
export const MIN_RADIUS_KM = 1
export const MAX_RADIUS_KM = 100

// Number('') is 0 (a false "valid" pass) — same footgun the backend's own
// validation (server/src/controllers/ground.controller.js) guards against,
// so empty/blank input is rejected explicitly rather than silently
// coerced to the equator/prime meridian.
function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

export function isValidLatitude(value) {
  if (isBlank(value)) return false
  const n = Number(value)
  return Number.isFinite(n) && n >= -90 && n <= 90
}

export function isValidLongitude(value) {
  if (isBlank(value)) return false
  const n = Number(value)
  return Number.isFinite(n) && n >= -180 && n <= 180
}

// Presentation-only formatting — the API already rounds distanceKm to 2
// decimals; this just picks a human-friendly unit/precision on top of that,
// it never re-derives the distance itself.
export function formatDistance(distanceKm) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) return null
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`
  return `${Math.round(distanceKm)} km away`
}

// Ground Time-Slot Pricing — "Starts from ₹X" on GroundCard, or the honest
// "Price on request" empty state when the ground has no active pricing
// slots yet. Never a fabricated ₹0 (startingPrice is null in that case,
// per the backend's own MIN(active price) subquery — see ground.model.js).
export function formatStartingPrice(startingPrice) {
  if (typeof startingPrice !== 'number' || !Number.isFinite(startingPrice)) return 'Price on request'
  return `Starts from ₹${startingPrice.toLocaleString('en-IN')}`
}

// A ground's public contact fields are all optional (a ground
// row can have null phone/email/website). Step 20 requires hiding missing
// fields rather than rendering a placeholder, so callers check this instead
// of relying on falsy-string coercion sprinkled through JSX.
export function hasValue(field) {
  return field !== null && field !== undefined && String(field).trim() !== ''
}

// Ground contact address — joins only the parts that exist, so a ground
// missing postalCode (say) doesn't render a dangling ", ,". Used by
// GroundContact/GroundAbout's map embed query.
export function formatGroundAddress(ground) {
  if (!ground) return ''
  return [ground.addressLine, ground.city, ground.state, ground.postalCode, ground.country]
    .filter(hasValue)
    .join(', ')
}
