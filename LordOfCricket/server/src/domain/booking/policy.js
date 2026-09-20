// Phase 14 Part 3 — the ground's operating policy, centralized here rather
// than scattered across components/queries (Part 11 of the spec). Nothing
// in this repository previously defined an operating timezone, opening/
// closing hours, or a slot duration (confirmed by audit) — these are new,
// explicit, documented defaults, overridable via env vars so ops can tune
// them without a code change. Every value here is a plain number/string —
// zero I/O, fully unit-testable.

// India does not observe DST, so a fixed UTC offset is correct year-round —
// no timezone library needed for this one, specific, non-DST zone.
export const GROUND_TIMEZONE = process.env.GROUND_TIMEZONE || 'Asia/Kolkata'
export const GROUND_UTC_OFFSET_MINUTES = 330 // +05:30

export const GROUND_OPENING_HOUR = Number(process.env.GROUND_OPENING_HOUR ?? 6) // 06:00 local
export const GROUND_CLOSING_HOUR = Number(process.env.GROUND_CLOSING_HOUR ?? 22) // 22:00 local

// v1: every booking is exactly one fixed-width slot — no custom-duration
// picker. Minimum/maximum booking duration are therefore both the slot
// duration; documented here as the single source of truth (docs/API.md,
// docs/ARCHITECTURE.md reference this module, not a hardcoded number).
export const SLOT_DURATION_MINUTES = Number(process.env.GROUND_SLOT_DURATION_MINUTES ?? 120)
export const MIN_BOOKING_MINUTES = SLOT_DURATION_MINUTES
export const MAX_BOOKING_MINUTES = SLOT_DURATION_MINUTES

// How many days ahead a customer may browse/book.
export const MAX_BOOKING_HORIZON_DAYS = Number(process.env.GROUND_BOOKING_HORIZON_DAYS ?? 60)

// Bounded, deterministic nearby-slot recommendation set (Part 23 — "3-5
// useful alternatives", never dozens).
export const MAX_RECOMMENDATIONS = 5
