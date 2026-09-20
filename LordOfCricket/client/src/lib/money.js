// Shared price formatting for the Merchandise store — matches the app's
// existing "₹" + en-IN convention (see server umpireEarnings / groundDiscovery).
export function formatPrice(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN')}` : null
}
