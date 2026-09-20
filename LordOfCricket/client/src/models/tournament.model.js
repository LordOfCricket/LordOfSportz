// Small pure display/formatting helpers — no cricket logic, no computed
// standings/results here, matching this codebase's models/ convention.

export const FORMAT_LABELS = {
  LEAGUE: 'League',
  GROUPS_KNOCKOUT: 'Groups + Knockout',
  KNOCKOUT: 'Direct Knockout',
}

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  REGISTRATION: 'Registration Open',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  COMPLETED: 'Completed',
}

export const STAGE_LABELS = {
  LEAGUE: 'League',
  GROUP: 'Group Stage',
  QUARTER_FINAL: 'Quarter-Final',
  SEMI_FINAL: 'Semi-Final',
  FINAL: 'Final',
}

export function formatLabel(format) {
  return FORMAT_LABELS[format] || format
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

export function stageLabel(fixture) {
  const base = STAGE_LABELS[fixture.stage] || fixture.stage
  if (fixture.stage === 'GROUP' && fixture.groupName) return `Group ${fixture.groupName}`
  return base
}

export function formatDateRange(startDate, endDate) {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' }
  const start = new Date(startDate).toLocaleDateString(undefined, opts)
  const end = new Date(endDate).toLocaleDateString(undefined, opts)
  return start === end ? start : `${start} – ${end}`
}

export function formatMatchDateTime(dateStr) {
  if (!dateStr) return 'Not yet scheduled'
  return new Date(dateStr).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function nrrDisplay(nrr) {
  if (nrr == null) return '0.000'
  const sign = nrr > 0 ? '+' : ''
  return `${sign}${nrr.toFixed(3)}`
}
