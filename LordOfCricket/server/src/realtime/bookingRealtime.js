// Phase 14 Part 3 (42) — a small, additive reuse of the existing shared
// Socket.IO instance, mirroring cricketRealtime.js's shape exactly. Zero new
// realtime architecture: one room per ground-local date, one broadcast event.
// Correctness never depends on this delivering — every client still performs
// its own authoritative server check on confirm (Part 42: "even if Client A
// misses a realtime event, final server-side conflict checking must prevent
// double booking"). This is a convenience refresh signal only.

import { logger } from '../utils/logger.js'

export function bookingDateRoom(dateStr) {
  return `booking:${dateStr}`
}

export function registerBookingRealtime(io) {
  io.on('connection', (socket) => {
    socket.on('join-booking-date', (payload) => {
      const dateStr = String(payload?.dateStr || '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) socket.join(bookingDateRoom(dateStr))
    })
    socket.on('leave-booking-date', (payload) => {
      const dateStr = String(payload?.dateStr || '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) socket.leave(bookingDateRoom(dateStr))
    })
  })
}

/** Fire-and-forget, never throws (same contract as publishMatchState) — a
 * booking write already committed before this is ever called. */
export function publishBookingUpdate(io, dateStr) {
  if (!io || !dateStr) return
  try {
    io.to(bookingDateRoom(dateStr)).emit('booking:updated', { dateStr })
  } catch (err) {
    logger.error('Booking realtime publish failed', { dateStr, error: err.message })
  }
}
