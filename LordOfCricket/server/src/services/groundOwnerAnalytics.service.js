// Phase 10 — Ground Owner Analytics & Reports. Provides ground owner with
// insights into booking trends, utilization, and operational metrics over
// configurable date ranges.
// Phase 14 — extended with real ground utilization (reusing the existing,
// already-tested domain/booking/utilization.js#computeUtilization exactly
// as groundReport.service.js's legacy staff-wide getUtilization already
// uses it, just ground-scoped) and canteen revenue.

import * as bookingRepo from '../repositories/groundBooking.repository.js'
import { sumCompletedRevenueForGround, dailyRevenueForGround } from '../models/canteenOrder.model.js'
import { computeUtilization } from '../domain/booking/utilization.js'
import { GROUND_OPENING_HOUR, GROUND_CLOSING_HOUR } from '../domain/booking/policy.js'
import { groundLocalToUtc, groundTodayDateStr, addDaysToDateStr, groundDateStr } from '../domain/booking/timezone.js'

// Predefined date ranges for analytics
const ANALYTICS_RANGES = {
  TODAY: 'TODAY',
  LAST_7_DAYS: 'LAST_7_DAYS',
  LAST_30_DAYS: 'LAST_30_DAYS',
}

// Phase 14 — fromDate/toDate (ground-local date strings, inclusive) are now
// also returned alongside the existing fromUtc/toUtc — utilization needs a
// day count and listMatchDatesInRange's own date-string signature, exactly
// as groundReport.service.js#getUtilization already computes it.
function getDateRangeFromPredefined(rangeKey) {
  const today = groundTodayDateStr()
  const todayStart = groundLocalToUtc(today, 0, 0)
  const todayEnd = groundLocalToUtc(today, 24, 0)

  switch (rangeKey) {
    case ANALYTICS_RANGES.TODAY:
      return { fromUtc: todayStart, toUtc: todayEnd, fromDate: today, toDate: today, label: 'Today' }
    case ANALYTICS_RANGES.LAST_7_DAYS: {
      const fromDate = addDaysToDateStr(today, -7)
      return { fromUtc: groundLocalToUtc(fromDate, 0, 0), toUtc: todayEnd, fromDate, toDate: today, label: 'Last 7 days' }
    }
    case ANALYTICS_RANGES.LAST_30_DAYS: {
      const fromDate = addDaysToDateStr(today, -30)
      return { fromUtc: groundLocalToUtc(fromDate, 0, 0), toUtc: todayEnd, fromDate, toDate: today, label: 'Last 30 days' }
    }
    default:
      return { fromUtc: todayStart, toUtc: todayEnd, fromDate: today, toDate: today, label: 'Today' }
  }
}

// Phase 10 — Booking analytics for a specific ground. Returns metrics:
// - Total bookings (all time, period)
// - Booking status breakdown (confirmed, cancelled, no-show)
// - Utilization percentage (booked hours / available hours)
// - Trends (booking counts by day, status distribution)
export async function getBookingAnalytics(groundId, dateRange = ANALYTICS_RANGES.TODAY) {
  const range = getDateRangeFromPredefined(dateRange)

  // Phase 11 audit fix — ground_id is now pushed down into the SQL WHERE
  // clause (searchBookings' new optional groundId parameter) instead of
  // fetching up to `limit` bookings across EVERY ground and filtering in JS.
  // The old approach both leaked other grounds' customer PII into this
  // process's memory unnecessarily and could silently undercount a busy
  // ground's own bookings once platform-wide volume in the range exceeded
  // the fetch limit.
  const bookings = await bookingRepo.searchBookings({
    bookingType: 'CUSTOMER',
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
    groundId,
    limit: 1000,
    offset: 0,
  })

  const groundBookings = bookings.rows || []

  const totalCount = groundBookings.length
  const confirmedCount = groundBookings.filter((b) => b.status === 'CONFIRMED').length
  const cancelledCount = groundBookings.filter((b) => b.status === 'CANCELLED').length
  const noShowCount = groundBookings.filter((b) => b.no_show_at !== null).length

  // Calculate total booked hours
  const totalBookedHours = groundBookings.reduce((sum, b) => {
    const start = new Date(b.start_time)
    const end = new Date(b.end_time)
    const hours = (end - start) / (1000 * 60 * 60)
    return sum + hours
  }, 0)

  return {
    dateRange: range.label,
    metrics: {
      totalBookings: totalCount,
      confirmedBookings: confirmedCount,
      cancelledBookings: cancelledCount,
      noShowBookings: noShowCount,
      totalBookedHours: parseFloat(totalBookedHours.toFixed(1)),
      averageBookingHours: totalCount > 0 ? parseFloat((totalBookedHours / totalCount).toFixed(2)) : 0,
    },
    breakdown: {
      confirmed: `${confirmedCount}/${totalCount}`,
      cancelled: `${cancelledCount}/${totalCount}`,
      noShow: `${noShowCount}/${totalCount}`,
    },
  }
}

// Phase 14 — ground utilization for the date range, reusing the existing
// computeUtilization domain function unmodified. Mirrors
// groundReport.service.js#getUtilization's own totalHours/matchHours math
// exactly, just with groundId pushed into both underlying queries so this
// never counts another ground's bookings/blocks/matches.
export async function getGroundUtilization(groundId, dateRange = ANALYTICS_RANGES.TODAY) {
  const range = getDateRangeFromPredefined(dateRange)

  let numDays = 0
  for (let d = range.fromDate; d <= range.toDate; d = addDaysToDateStr(d, 1)) numDays++
  const hoursPerDay = GROUND_CLOSING_HOUR - GROUND_OPENING_HOUR
  const totalHours = numDays * hoursPerDay

  const [hoursByType, matchDates] = await Promise.all([
    bookingRepo.sumOccupiedHoursByType(range.fromUtc, range.toUtc, groundId),
    bookingRepo.listMatchDatesInRange(range.fromDate, addDaysToDateStr(range.toDate, 1), groundId),
  ])
  const bookedHours = hoursByType.find((r) => r.booking_type === 'CUSTOMER')?.hours || 0
  const blockedHours = hoursByType.find((r) => r.booking_type === 'STAFF_BLOCK')?.hours || 0
  const matchHours = matchDates.length * hoursPerDay

  return { dateRange: range.label, ...computeUtilization({ totalHours, bookedHours, blockedHours, matchHours }) }
}

// Phase 14 — canteen revenue for the date range, summed across every
// canteen belonging to this ground (a ground can have more than one — Step
// 18). 'Completed' orders only — see sumCompletedRevenueForGround's own
// comment for why Cancelled is deliberately excluded.
export async function getCanteenRevenue(groundId, dateRange = ANALYTICS_RANGES.TODAY) {
  const range = getDateRangeFromPredefined(dateRange)
  const { revenue, orderCount } = await sumCompletedRevenueForGround(groundId, range.fromUtc, range.toUtc)
  return {
    dateRange: range.label,
    revenue,
    orderCount,
    averageOrderValue: orderCount > 0 ? parseFloat((revenue / orderCount).toFixed(2)) : 0,
  }
}

// Phase 14 — the single coherent response GET /ground-owner/grounds/:id/analytics
// now returns: every field getBookingAnalytics already returned (dateRange,
// metrics, breakdown — unchanged, so an existing consumer reading those
// keeps working exactly as before) PLUS utilization and canteenRevenue.
export async function getFullAnalytics(groundId, dateRange = ANALYTICS_RANGES.TODAY) {
  const [booking, utilization, canteenRevenue] = await Promise.all([
    getBookingAnalytics(groundId, dateRange),
    getGroundUtilization(groundId, dateRange),
    getCanteenRevenue(groundId, dateRange),
  ])
  return { ...booking, utilization, canteenRevenue }
}

// Phase 16 — day-by-day trend series for the date range: booking counts,
// canteen revenue ("revenue trend" — the only real revenue this schema
// tracks; ground_bookings itself has no price/amount column, so this is
// never a fabricated booking-revenue figure), and utilization %.
//
// PERFORMANCE: exactly 3 queries total for the whole range (booking
// counts, occupied hours, canteen revenue — each already a single
// GROUP BY query, never one query per day) plus the existing single-query
// listMatchDatesInRange. computeUtilization itself runs once per day, but
// that's pure in-memory arithmetic on already-fetched data, not a DB
// round-trip — never confuse "loop that computes" with "loop that queries."
export async function getTrends(groundId, dateRange = ANALYTICS_RANGES.TODAY) {
  const range = getDateRangeFromPredefined(dateRange)
  const hoursPerDay = GROUND_CLOSING_HOUR - GROUND_OPENING_HOUR

  const [bookingRows, hoursRows, revenueRows, matchDates] = await Promise.all([
    bookingRepo.dailyBookingCountsForGround(groundId, range.fromUtc, range.toUtc),
    bookingRepo.dailyOccupiedHoursForGround(groundId, range.fromUtc, range.toUtc),
    dailyRevenueForGround(groundId, range.fromUtc, range.toUtc),
    bookingRepo.listMatchDatesInRange(range.fromDate, addDaysToDateStr(range.toDate, 1), groundId),
  ])

  const matchDateSet = new Set(matchDates)
  const bookingsByDay = new Map()
  const blockedByDay = new Map()
  for (const row of bookingRows) {
    const day = groundDateStr(new Date(row.day))
    if (row.booking_type === 'CUSTOMER') bookingsByDay.set(day, row.count)
  }
  const bookedHoursByDay = new Map()
  for (const row of hoursRows) {
    const day = groundDateStr(new Date(row.day))
    if (row.booking_type === 'CUSTOMER') bookedHoursByDay.set(day, row.hours)
    if (row.booking_type === 'STAFF_BLOCK') blockedByDay.set(day, row.hours)
  }
  const revenueByDay = new Map(revenueRows.map((r) => [groundDateStr(new Date(r.day)), r.revenue]))

  const days = []
  for (let d = range.fromDate; d <= range.toDate; d = addDaysToDateStr(d, 1)) {
    const bookedHours = bookedHoursByDay.get(d) || 0
    const blockedHours = blockedByDay.get(d) || 0
    const matchHours = matchDateSet.has(d) ? hoursPerDay : 0
    const utilization = computeUtilization({ totalHours: hoursPerDay, bookedHours, blockedHours, matchHours })
    days.push({
      date: d,
      bookingCount: bookingsByDay.get(d) || 0,
      canteenRevenue: revenueByDay.get(d) || 0,
      utilizedPercentage: utilization.utilizedPercentage,
    })
  }

  return { dateRange: range.label, days }
}

export { ANALYTICS_RANGES }
