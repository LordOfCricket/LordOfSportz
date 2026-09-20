import * as notificationRepo from '../repositories/groundNotification.repository.js'
import { pool } from '../config/db.js'
import { logger } from '../utils/logger.js'
import { publishNotification } from '../realtime/notificationRealtime.js'
import { findCanteensByGroundId } from '../models/canteen.model.js'
import { getTodayMenu } from '../models/canteenTodayMenu.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { groundTodayDateStr, groundLocalToUtc, groundDateStr } from '../domain/shared/groundTime.js'

// Phase 18 Feature 17 — in-app notifications only. Same "best-effort,
// never blocks the primary action" posture as audit logging (§ groundAuditLog
// .service.js) and Google Calendar sync — a notification failing to write
// must never fail the booking/cancellation that triggered it.
// Phase 15 — groundId/relatedOrderId are additive (existing callers omit
// them, unaffected). `io` is also additive and optional: existing call
// sites that don't pass it keep working exactly as before (persisted, no
// live push); only the new Ground-Owner-facing call sites pass req.io,
// mirroring canteenOrder.controller.js's own req.io threading.
export async function createNotification({ userId, type, title, body = null, relatedBookingId = null, relatedMatchId = null, groundId = null, relatedOrderId = null, io = null }) {
  try {
    const notification = await notificationRepo.insertNotification(pool, { userId, type, title, body, relatedBookingId, relatedMatchId, groundId, relatedOrderId })
    publishNotification(io, notification)
    return notification
  } catch (err) {
    logger.error('Ground notification write failed', { userId, type, error: err.message })
    return null
  }
}

export async function listMyNotifications(userId, { limit = 20, offset = 0 } = {}) {
  const { rows, total } = await notificationRepo.listForUser(userId, { limit, offset })
  const unreadCount = await notificationRepo.countUnread(userId)
  return { notifications: rows, total, unreadCount }
}

export async function markRead(notificationId, userId) {
  return notificationRepo.markRead(notificationId, userId)
}

export async function markAllRead(userId) {
  return notificationRepo.markAllRead(userId)
}

// Phase 15 — Ground Owner's own portal view, ground-scoped.
export async function listGroundNotifications(userId, groundId, { limit = 20, offset = 0 } = {}) {
  const { rows, total } = await notificationRepo.listForGround(userId, groundId, { limit, offset })
  const unreadCount = await notificationRepo.countUnreadForGround(userId, groundId)
  return { notifications: rows, total, unreadCount }
}

export async function markAllReadForGround(userId, groundId) {
  return notificationRepo.markAllReadForGround(userId, groundId)
}

// Phase 15 — low stock / menu-not-published are absence/threshold
// conditions, not discrete write-path events (there's no single "this
// happened" moment to hook a trigger onto the way booking-created is) — so
// they're checked on-demand whenever the Owner's dashboard loads, guarded
// by existsSinceForGround so a page reload never creates a duplicate
// notification for the same day. Best-effort: never throws, matching every
// other notification trigger's posture (a check failing here must never
// break the dashboard it's attached to).
const LOW_STOCK_THRESHOLD = 5

export async function checkOperationalAlerts(groundId, io = null) {
  try {
    const ownerUserIds = await findActiveGroundOwnerUserIds(groundId)
    if (ownerUserIds.length === 0) return

    const today = groundTodayDateStr()
    const dayStart = groundLocalToUtc(today, 0, 0)
    const canteens = await findCanteensByGroundId(groundId)

    let menuNotPublished = false
    let lowStockCount = 0

    for (const canteen of canteens) {
      const menu = await getTodayMenu(canteen.id)
      if (!menu || groundDateStr(new Date(menu.published_at)) !== today) {
        menuNotPublished = true
        continue
      }
      lowStockCount += menu.items.filter((item) => item.available && item.stock <= LOW_STOCK_THRESHOLD).length
    }

    for (const ownerUserId of ownerUserIds) {
      if (menuNotPublished && !(await notificationRepo.existsSinceForGround(ownerUserId, groundId, 'CANTEEN_MENU_NOT_PUBLISHED', dayStart))) {
        await createNotification({
          userId: ownerUserId,
          type: 'CANTEEN_MENU_NOT_PUBLISHED',
          title: "Today's menu not published",
          body: "One or more of your canteens haven't published today's menu yet.",
          groundId,
          io,
        })
      }
      if (lowStockCount > 0 && !(await notificationRepo.existsSinceForGround(ownerUserId, groundId, 'CANTEEN_LOW_STOCK', dayStart))) {
        await createNotification({
          userId: ownerUserId,
          type: 'CANTEEN_LOW_STOCK',
          title: 'Low stock alert',
          body: `${lowStockCount} item${lowStockCount === 1 ? ' is' : 's are'} running low on stock today.`,
          groundId,
          io,
        })
      }
    }
  } catch (err) {
    logger.error('Operational alert check failed', { groundId, error: err.message })
  }
}
