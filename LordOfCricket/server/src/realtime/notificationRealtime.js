// Phase 15 — Ground Owner notification live delivery. Reuses the existing
// authenticated `user:{userId}` room canteenRealtime.js's join-user-room
// handler already established (auth-checked there: "you can only join your
// own user room") — no second WebSocket architecture, no new join handler.
// Fire-and-forget, never throws (same contract as publishBookingUpdate/
// emitToOrderRooms) — a notification write already committed before this
// is ever called, so a delivery failure must never surface as an error to
// whatever triggered the notification.
import { logger } from '../utils/logger.js'

export function publishNotification(io, notification) {
  if (!io || !notification) return
  try {
    io.to(`user:${notification.user_id}`).emit('notification:new', notification)
  } catch (err) {
    logger.error('Notification realtime publish failed', { userId: notification.user_id, error: err.message })
  }
}
