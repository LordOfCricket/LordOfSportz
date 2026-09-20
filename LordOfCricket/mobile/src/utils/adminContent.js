import { isNetworkError } from './errors'

export function activeMeta(isActive) {
  return isActive === false
    ? { label: 'Inactive', tone: 'neutral' }
    : { label: 'Active', tone: 'positive' }
}

// Amenity icons are lucide-react names (e.g. "ParkingSquare"); mobile has no
// lucide, so the name is shown as a readable label rather than a glyph.
export function humanizeToken(value) {
  if (!value) return ''
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

export function contentErrorMessage(err) {
  const httpStatus = err?.response?.status
  // The backend uses these curated 400 messages for image problems; match on
  // a substring to pick a canned message, never rendering the raw text.
  const raw = String(err?.response?.data?.message || '')
  if (httpStatus === 413 || /10\s?mb/i.test(raw)) return 'That image is too large. Use one under 10 MB.'
  if (/jpe?g|png|webp/i.test(raw)) return 'That image type isn’t supported. Use JPEG, PNG or WEBP.'
  if (httpStatus === 400) return 'Check the form and try again.'
  if (httpStatus === 401 || httpStatus === 403) return 'You don’t have access to manage this content.'
  if (httpStatus === 404) return 'This item no longer exists. The list has been refreshed.'
  if (httpStatus === 409) return 'This item is in use and can’t be removed. Deactivate it instead.'
  if (isNetworkError(err)) return 'You appear to be offline. Check your connection and try again.'
  return 'Something went wrong. Try again.'
}

// Merchandise — values come straight from the backend enums.
export const MERCHANDISE_CATEGORIES = [
  'Cricket Bats',
  'Cricket Balls',
  'Cricket Jerseys',
  'Cricket Shoes',
  'Cricket Accessories',
  'Protective Gear',
]

export const MERCHANDISE_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK']

export function merchStatusMeta(status) {
  const M = {
    ACTIVE: { label: 'Active', tone: 'positive' },
    DRAFT: { label: 'Draft', tone: 'neutral' },
    INACTIVE: { label: 'Inactive', tone: 'neutral' },
    OUT_OF_STOCK: { label: 'Out of stock', tone: 'warn' },
  }
  return M[status] ?? { label: status ? String(status) : 'Unknown', tone: 'neutral' }
}

// UX-only mirror of the backend cross-field price rules. Returns an error
// string or null.
export function validateMerchandisePrices({ sellingPrice, originalPrice, discountPrice }) {
  const selling = Number(sellingPrice)
  if (!Number.isFinite(selling) || selling <= 0) return 'Enter a selling price greater than 0.'
  if (originalPrice !== '' && originalPrice != null) {
    const original = Number(originalPrice)
    if (!Number.isFinite(original) || original <= 0) return 'Original price must be greater than 0.'
    if (selling > original) return 'Selling price can’t be more than the original price.'
  }
  if (discountPrice !== '' && discountPrice != null) {
    const discount = Number(discountPrice)
    if (!Number.isFinite(discount) || discount <= 0) return 'Discount price must be greater than 0.'
    if (discount > selling) return 'Discount price can’t be more than the selling price.'
  }
  return null
}

export function formatPrice(value) {
  const n = Number(value)
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : '—'
}
