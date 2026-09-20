// Pure display formatting only. No availability/conflict
// logic lives here — the server is always authoritative for that.
export function formatSlotTime(isoStart, isoEnd) {
  const opts = { hour: 'numeric', minute: '2-digit', hour12: true }
  const start = new Date(isoStart).toLocaleTimeString('en-IN', opts)
  const end = new Date(isoEnd).toLocaleTimeString('en-IN', opts)
  return `${start} – ${end}`
}

export function formatBookingDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function todayDateInputValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// UI convenience only (default date-range bounds for pickers) — never used
// for availability/booking correctness, which is always server-computed.
export function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Mirrors server/src/domain/booking/blockTypes.js.
// Display-only; the server independently validates every value.
export const GROUND_BLOCK_TYPES = {
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
}
