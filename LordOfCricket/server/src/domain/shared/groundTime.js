import { GROUND_UTC_OFFSET_MINUTES } from '../booking/policy.js'

// Phase 14 Part 3 (booking) — fixed-offset (IST, no DST) timezone math with
// zero dependencies. Originally lived under domain/booking/ since booking
// was its first consumer, but the logic itself is domain-agnostic ground-
// local time math, not booking-specific — moved here (Umpire Communication
// & Commercial 2.0) so umpire-domain code (the reminder scheduler) can
// import it without a misleading "umpire code depends on booking domain"
// path. domain/booking/timezone.js re-exports everything from here for
// backward compatibility with existing booking imports.
//
// Correct specifically because Asia/Kolkata has no DST — a fixed-offset
// zone with a variable UTC offset (DST-observing) would need a real tz
// database instead of this approach.

const OFFSET_MS = GROUND_UTC_OFFSET_MINUTES * 60 * 1000

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM-DD' + local hour/minute -> the true UTC instant (a Date). */
export function groundLocalToUtc(dateStr, hour = 0, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour, minute, 0) - OFFSET_MS)
}

/** UTC Date -> ground-local calendar/time components, immune to the host's own TZ. */
export function utcToGroundLocalParts(date) {
  const shifted = new Date(date.getTime() + OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

/** UTC Date -> 'YYYY-MM-DD' in ground-local time. */
export function groundDateStr(date) {
  const { year, month, day } = utcToGroundLocalParts(date)
  return `${year}-${pad(month)}-${pad(day)}`
}

export function groundTodayDateStr() {
  return groundDateStr(new Date())
}

/** Adds `days` (may be negative) to a ground-local date string. Anchored at
 * local noon before shifting so the fixed +05:30 offset can never land the
 * shifted instant on the wrong side of a calendar-day boundary. */
export function addDaysToDateStr(dateStr, days) {
  const noonUtc = groundLocalToUtc(dateStr, 12, 0)
  return groundDateStr(new Date(noonUtc.getTime() + days * 24 * 3600 * 1000))
}

export function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  // Date.UTC silently normalizes out-of-range components (e.g. month 13,
  // day 40) instead of producing NaN — round-trip the parsed value and
  // compare, which is the only reliable way to reject those with plain Date.
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** A real UTC Date -> 'YYYY-MM-DD HH:MM:SS' ground-local digits, as a plain
 * (no offset suffix) string. Umpire Communication & Commercial 2.0 —
 * exists for exactly one purpose: comparing against a naive `TIMESTAMP`
 * (no timezone) column like `matches.match_date`, whose stored digits are
 * always ground-local wall-clock digits (what a Ground Owner typed into a
 * datetime-local input), never UTC. Postgres's cast of a string to
 * `timestamp` keeps the literal digits verbatim and drops any offset
 * suffix — so passing a `.toISOString()` (UTC-digit) string here is the
 * exact bug this function replaces: it must be ground-local digits on both
 * sides of the SQL comparison, or the comparison silently compares two
 * different clocks. */
export function groundLocalNaiveTimestamp(date) {
  const { year, month, day, hour, minute } = utcToGroundLocalParts(date)
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:00`
}
