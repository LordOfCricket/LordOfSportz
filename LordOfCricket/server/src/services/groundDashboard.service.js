import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { groundTodayDateStr, groundLocalToUtc, addDaysToDateStr } from '../domain/booking/timezone.js'
import { getDailyTimeline } from './groundTimeline.service.js'
import { blockTypeLabel } from '../domain/booking/blockTypes.js'

const UPCOMING_WINDOW_DAYS = 7

// Phase 18 Feature 7 — the staff dashboard is pure composition of already-
// existing reads (today's timeline, confirmed bookings/blocks, matches) —
// zero new occupancy truth, same "never a second source" principle every
// other Phase 17/15 aggregate service already follows.
export async function getStaffDashboard() {
  const today = groundTodayDateStr()
  const dayStart = groundLocalToUtc(today, 0, 0)
  const dayEnd = groundLocalToUtc(today, 24, 0)
  const weekEnd = groundLocalToUtc(addDaysToDateStr(today, UPCOMING_WINDOW_DAYS), 24, 0)

  const [timeline, todayRows, todayMatches, upcomingBlocks, upcomingMatches] = await Promise.all([
    getDailyTimeline(today),
    bookingRepo.listConfirmedInRange(dayStart, dayEnd),
    bookingRepo.listMatchEntriesInRange(today, addDaysToDateStr(today, 1)),
    bookingRepo.listBlocksInRange(dayEnd, weekEnd),
    bookingRepo.listMatchEntriesInRange(addDaysToDateStr(today, 1), addDaysToDateStr(today, UPCOMING_WINDOW_DAYS)),
  ])

  const todayBookings = todayRows.filter((r) => r.booking_type === 'CUSTOMER')
  const todayBlocks = todayRows.filter((r) => r.booking_type === 'STAFF_BLOCK')

  return {
    date: today,
    groundStatus: todayMatches.length > 0 ? 'MATCH_DAY' : todayBlocks.length > 0 ? 'PARTIALLY_BLOCKED' : todayBookings.length > 0 ? 'BOOKED' : 'OPEN',
    todayBookingsCount: todayBookings.length,
    todayBlocksCount: todayBlocks.length,
    todayMatches: todayMatches.map((m) => ({
      matchId: m.id,
      teamA: m.team_a_name,
      teamB: m.team_b_name,
      status: m.status,
      tournamentName: m.tournament_name,
      stage: m.stage,
    })),
    todayBookings: todayBookings.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, purpose: r.purpose })),
    todayBlocks: todayBlocks.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, blockType: r.block_type, label: blockTypeLabel(r.block_type) })),
    // No manual approval workflow exists in this system (see
    // domain/booking/bookingStatus.js) — every booking is auto-confirmed, so
    // there is never a real pending queue. Reported honestly as 0, not omitted.
    pendingRequestsCount: 0,
    upcomingMaintenance: upcomingBlocks.map((r) => ({ publicBookingId: r.public_booking_id, startTime: r.start_time, endTime: r.end_time, blockType: r.block_type, label: blockTypeLabel(r.block_type) })),
    upcomingTournamentFixtures: upcomingMatches
      .filter((m) => m.tournament_name)
      .map((m) => ({ matchId: m.id, teamA: m.team_a_name, teamB: m.team_b_name, matchDate: m.match_date, tournamentName: m.tournament_name, stage: m.stage })),
    timeline: timeline.segments,
  }
}
