// Booking limits and abuse control configuration
// Centralized place for all booking-related limits

export const BOOKING_LIMITS = {
  // Player limits
  MAX_ACTIVE_BOOKINGS_PER_PLAYER: Number(process.env.MAX_ACTIVE_BOOKINGS_PER_PLAYER ?? 10),
  MAX_ACTIVE_BOOKINGS_PER_TEAM: Number(process.env.MAX_ACTIVE_BOOKINGS_PER_TEAM ?? 10),

  // Proposal limits
  MAX_OPEN_PROPOSALS_PER_TEAM: Number(process.env.MAX_OPEN_PROPOSALS_PER_TEAM ?? 5),

  // Booking window
  MAX_BOOKING_HORIZON_DAYS: Number(process.env.MAX_BOOKING_HORIZON_DAYS ?? 90),

  // Cancellation tracking
  MAX_CANCELLATIONS_PER_DAY: Number(process.env.MAX_CANCELLATIONS_PER_DAY ?? 5),

  // No-show tracking
  MAX_NO_SHOWS_PER_MONTH: Number(process.env.MAX_NO_SHOWS_PER_MONTH ?? 3),
}

export function validateBookingLimits() {
  // Ensure all limits are positive numbers
  Object.entries(BOOKING_LIMITS).forEach(([key, value]) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid booking limit ${key}: ${value}`)
    }
  })
}

// Check if a player is approaching a limit (for UI warnings)
export function isApproachingCancellationLimit(cancellationCount) {
  return cancellationCount >= BOOKING_LIMITS.MAX_CANCELLATIONS_PER_DAY - 1
}

export function isApproachingNoShowLimit(noShowCount) {
  return noShowCount >= BOOKING_LIMITS.MAX_NO_SHOWS_PER_MONTH - 1
}
