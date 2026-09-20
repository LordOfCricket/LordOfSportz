// Display/formatting helpers for tournaments — a 1:1 mirror of the website's
// client/src/models/tournament.model.js so both platforms use identical
// terminology. No cricket logic here.

import { TournamentFixture, TournamentFormat, TournamentStatus } from '../services/tournamentApi'

export const FORMAT_LABELS: Record<string, string> = {
  LEAGUE: 'League',
  GROUPS_KNOCKOUT: 'Groups + Knockout',
  KNOCKOUT: 'Direct Knockout',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  REGISTRATION: 'Registration Open',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  COMPLETED: 'Completed',
}

export const STAGE_LABELS: Record<string, string> = {
  LEAGUE: 'League',
  GROUP: 'Group Stage',
  QUARTER_FINAL: 'Quarter-Final',
  SEMI_FINAL: 'Semi-Final',
  FINAL: 'Final',
}

// Knockout stages in bracket order — mirrors client BracketView.jsx STAGE_ORDER.
export const KNOCKOUT_STAGE_ORDER = ['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const

export function formatLabel(format: TournamentFormat | string): string {
  return FORMAT_LABELS[format] || format
}

export function statusLabel(status: TournamentStatus | string): string {
  return STATUS_LABELS[status] || status
}

export function stageLabel(fixture: Pick<TournamentFixture, 'stage' | 'groupName'>): string {
  const base = STAGE_LABELS[fixture.stage] || fixture.stage
  if (fixture.stage === 'GROUP' && fixture.groupName) return `Group ${fixture.groupName}`
  return base
}

// Parse a YYYY-MM-DD (or leading-YYYY-MM-DD) string via the local numeric
// constructor so the calendar day rendered is always exactly the day
// encoded, regardless of device timezone — the same fix
// src/utils/playerFormatting.ts#formatDate already applies.
function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateRange(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const s = parseDateOnly(startDate)
  const e = parseDateOnly(endDate)
  const start = s ? s.toLocaleDateString(undefined, opts) : startDate
  const end = e ? e.toLocaleDateString(undefined, opts) : endDate
  return start === end ? start : `${start} – ${end}`
}

export function formatMatchDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Not yet scheduled'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Not yet scheduled'
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function nrrDisplay(nrr: number | null | undefined): string {
  if (nrr == null) return '0.000'
  const sign = nrr > 0 ? '+' : ''
  return `${sign}${nrr.toFixed(3)}`
}
