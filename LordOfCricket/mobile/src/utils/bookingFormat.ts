// Display formatting for booking/slot times. Matches the existing player
// booking screens, which render slot times with device-local
// toLocaleTimeString('en-IN', ...). Ground-local (IST) values that must be
// sent to the API go through utils/groundTime.ts instead.

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`
}

export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
