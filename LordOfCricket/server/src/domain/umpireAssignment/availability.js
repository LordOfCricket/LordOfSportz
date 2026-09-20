// Umpire availability calendar — pure, zero-I/O (same "domain is pure"
// convention as matchTimeRange.js/domain/booking/availability.js). The
// service layer fetches the umpire's weekly rules + date overrides and
// feeds them here alongside the candidate match's estimated time range;
// this module only decides available/unavailable, never touches Postgres.
//
// No rows at all = fully available — the same default umpire_profiles.
// is_available already implies, and the state every existing umpire is in
// before this phase, so wiring this into applyForSlot cannot regress any
// currently-passing assignment.

function toDateStr(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC) — consistent with the rest of this domain, which never does ground-local timezone conversion for umpire matching (only the booking domain does that, for ground opening hours)
}

function toTimeStr(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().slice(11, 16) // HH:MM (UTC)
}

/** A date-specific row with both start_time and end_time set only overrides
 * that window — a match outside the window falls back to the weekly rule
 * instead. A row with no times set is a whole-day override. */
function overrideAppliesToMatch(override, matchStartTimeStr) {
  if (!override.start_time || !override.end_time) return true
  return matchStartTimeStr >= override.start_time.slice(0, 5) && matchStartTimeStr < override.end_time.slice(0, 5)
}

/**
 * isUmpireAvailableForMatch({start}, weeklyRules, dateOverrides)
 * - weeklyRules: [{ day_of_week: 0-6, is_available }]
 * - dateOverrides: [{ specific_date: 'YYYY-MM-DD', start_time, end_time, is_available }]
 * `start` is the match's estimated start (matchTimeRange.js's `start`).
 */
export function isUmpireAvailableForMatch({ start }, weeklyRules = [], dateOverrides = []) {
  const dateStr = toDateStr(start)
  const timeStr = toTimeStr(start)

  const override = dateOverrides.find((o) => o.specific_date === dateStr && overrideAppliesToMatch(o, timeStr))
  if (override) return override.is_available

  const dayOfWeek = (start instanceof Date ? start : new Date(start)).getUTCDay()
  const weeklyRule = weeklyRules.find((w) => w.day_of_week === dayOfWeek)
  if (weeklyRule) return weeklyRule.is_available

  return true // no rule at all for this day = available (default-open convention)
}
