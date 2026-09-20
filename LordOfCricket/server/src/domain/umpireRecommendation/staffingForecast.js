// Umpire Intelligence & Scale 2.0, Workstream K — a deterministic
// operational indicator, NOT a machine-learning prediction (explicitly
// forbidden by the task). Pure, zero-I/O: every input is already fetched by
// the caller (filled_slots/total_slots/match_date are already on every
// ground-owner match-list row).

export const STAFFING_STATUS = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  FULLY_STAFFED: 'FULLY_STAFFED',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  OPEN: 'OPEN',
})

// Understaffed AND fewer than this many hours remain -> flagged for
// attention. Documented, single constant — not a hidden magic number.
const ATTENTION_THRESHOLD_HOURS = 4

/**
 * computeStaffingForecast({ filledSlots, totalSlots, hoursUntilMatch }) ->
 * { status, filledSlots, totalSlots, hoursUntilMatch }
 * `hoursUntilMatch` may be negative (match already started/passed) — treated
 * the same as "no time left", never a crash.
 */
export function computeStaffingForecast({ filledSlots, totalSlots, hoursUntilMatch }) {
  if (!totalSlots || totalSlots <= 0) {
    return { status: STAFFING_STATUS.NOT_REQUIRED, filledSlots, totalSlots, hoursUntilMatch }
  }
  if (filledSlots >= totalSlots) {
    return { status: STAFFING_STATUS.FULLY_STAFFED, filledSlots, totalSlots, hoursUntilMatch }
  }
  if (hoursUntilMatch != null && hoursUntilMatch <= ATTENTION_THRESHOLD_HOURS) {
    return { status: STAFFING_STATUS.NEEDS_ATTENTION, filledSlots, totalSlots, hoursUntilMatch }
  }
  return { status: STAFFING_STATUS.OPEN, filledSlots, totalSlots, hoursUntilMatch }
}
