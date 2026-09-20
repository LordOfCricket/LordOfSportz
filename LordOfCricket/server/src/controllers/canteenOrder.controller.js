import {
  PRESET_STATUS,
  insertOrder,
  findActiveOrderByUserId,
  findOrderById,
  findLatestOrderByUserId,
  findOrderHistoryByUserId,
  listOrdersPaginated,
  updateOrderStatusByPublicId,
} from '../models/canteenOrder.model.js'
import { findActiveGroundOwnerUserIds } from '../models/groundUser.model.js'
import { findGroundById } from '../models/ground.model.js'
import * as notificationService from '../services/groundNotification.service.js'
import { resolveOrderableMenu, resolveOrderLines, CanteenOrderPricingError } from '../services/canteenOrderPricing.service.js'
import { authorizeResolvedCanteen } from '../middlewares/groundAccess.js'
import { respondMfaRequired } from '../services/mfaState.service.js'
import { logger } from '../utils/logger.js'

// MongoDB cleanup, Phase 5 (final feature) — Order is now unconditionally
// PostgreSQL, a hard dependency for this whole app (never "unreachable" the
// way MongoDB was). Every `isMongoReady()` gate and the `orders` in-memory
// demo-data fallback (canteenStore.model.js) that used to appear in this
// file are gone entirely — MongoDB is no longer required by any live
// canteen feature after this phase (GalleryImage/AiInsight/MenuItem/
// TodayMenu/Order are all PostgreSQL now).

function toPublicOrder(row) {
  if (!row) return null
  return {
    id: row.public_order_id,
    userId: row.user_id,
    customerName: row.customer_name,
    seatId: row.seat_id,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    orderedAt: row.ordered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

// Phase 17.1 — maps the server-resolved pricing lines (canteenOrderPricing
// .service.js) into the exact shape insertOrder/resolveMenuItemId already
// expect. insertOrder itself is intentionally untouched (existing tests
// call it directly with arbitrary fixture data) — the trust boundary is
// enforced here, before insertOrder is ever called, not inside it.
function toInsertableItems(resolvedItems) {
  return resolvedItems.map((item) => ({
    id: item.menuItemId,
    foodId: item.menuItemId,
    name: item.name,
    qty: item.qty,
    price: item.unitPrice,
  }))
}

const PRICING_ERROR_STATUS = {
  EMPTY_ORDER: 400,
  INVALID_QUANTITY: 400,
  ITEM_NOT_FOUND: 400,
  ITEM_UNAVAILABLE: 409,
  INSUFFICIENT_STOCK: 409,
}

function emitToOrderRooms(io, eventName, order) {
  if (!io || !order) return

  const aliases = {
    'order-created': 'order.created',
    'order-status-updated': 'order.status.updated',
    'order-completed': 'order.completed',
  }
  const rooms = ['staff']

  if (order.id) {
    rooms.push(`order:${order.id}`)
  }

  if (order.userId) {
    rooms.push(`user:${order.userId}`)
  }

  io.to(rooms).emit(eventName, order)
  if (aliases[eventName]) {
    io.to(rooms).emit(aliases[eventName], order)
  }
}

export async function createOrder(req, res, next) {
  const { seatId, items } = req.body
  const userId = req.user.id
  const customerName = req.user.name
  const canteenId = req.canteen.id

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order payload is invalid.' })
  }

  // Phase 17.2 — canteens.is_active was written at creation/toggle time but
  // never actually enforced anywhere in the order-placement path (a
  // deactivated canteen could still receive new orders). Scoped to
  // creation only — reading the menu, viewing history, or a staff member
  // progressing an ALREADY-placed order must keep working after a canteen
  // is deactivated (that's legitimate wind-down activity, not new activity).
  if (req.canteen.is_active === false) {
    logger.warn('Canteen order rejected — canteen is not active', { canteenId, userId })
    return res.status(409).json({ error: 'This canteen is not currently accepting orders.', code: 'CANTEEN_CLOSED' })
  }

  // Phase 17.2 — a suspended ground's canteen must not operate either,
  // same "no new activity anywhere at a suspended ground" rule
  // groundBooking.service.js#createBooking now enforces for walk-in
  // bookings. req.canteen.ground_id is server-resolved by
  // attachCurrentCanteen/attachGroundCanteenContext, never client input.
  const ground = await findGroundById(req.canteen.ground_id)
  if (!ground || ground.status !== 'ACTIVE') {
    logger.warn('Canteen order rejected — ground is not ACTIVE', { canteenId, groundId: req.canteen.ground_id, groundStatus: ground?.status || 'NOT_FOUND', userId })
    return res.status(409).json({ error: 'This ground is not currently accepting orders.', code: 'GROUND_CLOSED' })
  }

  try {
    // Friendly fast-path pre-check (matches the retired code's own
    // findOne-before-create shape) — the REAL guarantee is the partial
    // unique index `idx_orders_one_active_per_canteen_user`, caught below.
    const existingActive = await findActiveOrderByUserId(userId, canteenId)
    if (existingActive) {
      return res.status(409).json({
        error: 'You already have an active order.',
        order: toPublicOrder(existingActive),
      })
    }

    // Phase 17.1 — price/subtotal/total are NEVER read from req.body.
    // Every item is resolved against the same authoritative menu
    // (canteenMenuItem.model.js + today's published settings) a customer
    // browsing this canteen was actually shown — id/qty are the only
    // client input that crosses the trust boundary; price, name, and the
    // order total are always server-computed from here on.
    const orderableMenu = await resolveOrderableMenu(canteenId)
    let resolvedOrder
    try {
      resolvedOrder = resolveOrderLines(items, orderableMenu)
    } catch (err) {
      if (err instanceof CanteenOrderPricingError) {
        // Warn, not error — a rejected cart (stale price shown, sold out
        // since page load, or a genuine tamper attempt) is expected client
        // behavior, not a server fault. Never logs the client's submitted
        // price/total — only which validation failed and for which item,
        // enough to diagnose a pattern without echoing untrusted input.
        logger.warn('Canteen order rejected — pricing/availability validation failed', { canteenId, userId, code: err.code })
        return res.status(PRICING_ERROR_STATUS[err.code] || 400).json({ error: err.message, code: err.code })
      }
      throw err
    }

    let order
    try {
      order = await insertOrder({
        userId,
        canteenId,
        customerName,
        seatId: seatId || 'unknown',
        items: toInsertableItems(resolvedOrder.items),
        total: resolvedOrder.total,
      })
    } catch (err) {
      // Phase 14's original guarantee, now enforced by Postgres: two
      // near-simultaneous requests can both pass the pre-check above, but
      // the database rejects the second INSERT (23505 unique_violation on
      // the partial index) — this is not a fallback path, it's the source
      // of correctness, exactly as it was with MongoDB's E11000. Phase 10:
      // the guarantee is now per-(canteen, user), not just per-user, so
      // this same code path also protects against a canteen-scoped race.
      if (err.code === '23505') {
        const stillActive = await findActiveOrderByUserId(userId, canteenId)
        return res.status(409).json({
          error: 'You already have an active order.',
          order: toPublicOrder(stillActive),
        })
      }
      throw err
    }

    const responseOrder = toPublicOrder(order)
    emitToOrderRooms(req.io, 'order-created', responseOrder)

    // Phase 15 — Ground Owner notification. createNotification already
    // never throws (its own try/catch), same posture as every other call
    // site. req.canteen.ground_id is server-resolved by
    // attachCurrentCanteen/attachGroundCanteenContext, never client input.
    const ownerUserIds = await findActiveGroundOwnerUserIds(req.canteen.ground_id)
    await Promise.all(
      ownerUserIds.map((ownerUserId) =>
        notificationService.createNotification({
          userId: ownerUserId,
          type: 'CANTEEN_ORDER_RECEIVED',
          title: 'New canteen order',
          body: `${customerName} placed an order (${responseOrder.publicOrderId || responseOrder.id}).`,
          relatedOrderId: order.id,
          groundId: req.canteen.ground_id,
          io: req.io,
        }),
      ),
    )

    return res.json({ order: responseOrder })
  } catch (error) {
    next(error)
  }
}

export async function listOrders(req, res, next) {
  try {
    const activeOnly = req.query.status === 'active'
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 5))

    const { total, orders: orderRows } = await listOrdersPaginated({ canteenId: req.canteen.id, activeOnly, page, limit })
    return res.json({ page, limit, total, orders: orderRows.map(toPublicOrder) })
  } catch (error) {
    next(error)
  }
}

// Phase 10 Step 26 — findOrderById is canteen-scoped: an order id that
// belongs to a different canteen returns null here, same as a genuinely
// unknown id, so staff scoped to one canteen can never fetch another
// canteen's order by guessing/knowing its public id.
export async function getOrder(req, res, next) {
  try {
    const order = await findOrderById(req.params.id, req.canteen.id)
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' })
    }
    // CUSTOMER_CANTEEN_MIGRATION — the order's own customer may always view
    // it. Anyone else falls back to the EXACT same staff-membership check
    // orderStaffAccess used to enforce at the route level (legacy staff OR
    // ground_users GROUND_OWNER/GROUND_ADMIN/CANTEEN_STAFF, reusing
    // authorizeResolvedCanteen rather than re-deriving that logic) — so a
    // Ground Owner/staff member viewing a customer's order is unaffected,
    // only a genuine stranger is rejected.
    if (req.user.id !== order.user_id) {
      const result = await authorizeResolvedCanteen(req, req.canteen, { legacyStaffRoles: 'any', groundRoles: ['GROUND_OWNER', 'GROUND_ADMIN', 'CANTEEN_STAFF'] })
      if (result.mfaRequired) return respondMfaRequired(res)
      if (!result.allowed) {
        return res.status(403).json({ error: 'You can only view your own orders.' })
      }
    }
    return res.json({ order: toPublicOrder(order) })
  } catch (error) {
    next(error)
  }
}

export async function lookupOrderByUser(req, res, next) {
  try {
    const userId = Number(req.query.userId)
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' })
    }
    const order = await findLatestOrderByUserId(userId, req.canteen.id)
    return res.json({ order: toPublicOrder(order) })
  } catch (error) {
    next(error)
  }
}

export async function getActiveOrder(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' })
    }
    if (req.user.id !== userId && req.user.role !== 'staff') {
      return res.status(403).json({ error: 'You can only view your own orders.' })
    }
    const order = await findActiveOrderByUserId(userId, req.canteen.id)
    return res.json({ order: toPublicOrder(order) })
  } catch (error) {
    next(error)
  }
}

export async function getOrderHistory(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    if (!userId) {
      return res.status(400).json({ error: 'userId is required.' })
    }
    if (req.user.id !== userId && req.user.role !== 'staff') {
      return res.status(403).json({ error: 'You can only view your own orders.' })
    }
    const history = await findOrderHistoryByUserId(userId, req.canteen.id)
    return res.json({ orders: history.map(toPublicOrder) })
  } catch (error) {
    next(error)
  }
}

// Phase 10 Step 26 — updateOrderStatusByPublicId is canteen-scoped: staff
// authorized for one canteen cannot transition another canteen's order by
// id, even though the OLD requireRole('staff')/new requireCanteenStaffAccess
// check itself is not yet per-canteen-authorized for the legacy-staff path
// (see groundAccess.js's comment) — this query-level scoping is the actual
// tenant boundary enforcement Invariant 6 requires.
export async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body
    if (!status || !PRESET_STATUS.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' })
    }

    const order = await updateOrderStatusByPublicId(req.params.id, req.canteen.id, status)
    if (!order) {
      // Phase 21.4 — the model's WHERE clause now excludes a no-op
      // same-status transition, so a null result here is ambiguous: either
      // the order genuinely doesn't exist (or belongs to another canteen),
      // or it exists and is already in the requested status (a repeat
      // click). Distinguish them with a lookup rather than assuming 404, so
      // a double-click returns the current order state idempotently instead
      // of a confusing "not found" error — and, just as importantly, does
      // NOT re-emit sockets or re-notify the Ground Owner below.
      const existing = await findOrderById(req.params.id, req.canteen.id)
      if (!existing) {
        return res.status(404).json({ error: 'Order not found.' })
      }
      return res.json({ order: toPublicOrder(existing) })
    }

    const responseOrder = toPublicOrder(order)
    emitToOrderRooms(req.io, 'order-status-updated', responseOrder)
    if (responseOrder.status === 'Completed') {
      emitToOrderRooms(req.io, 'order-completed', responseOrder)
    }

    // Phase 15 — Ground Owner notification for the status change.
    const ownerUserIds = await findActiveGroundOwnerUserIds(req.canteen.ground_id)
    await Promise.all(
      ownerUserIds.map((ownerUserId) =>
        notificationService.createNotification({
          userId: ownerUserId,
          type: 'CANTEEN_ORDER_STATUS_CHANGED',
          title: 'Canteen order status updated',
          body: `Order ${responseOrder.publicOrderId || responseOrder.id} is now ${status}.`,
          relatedOrderId: order.id,
          groundId: req.canteen.ground_id,
          io: req.io,
        }),
      ),
    )

    return res.json({ order: responseOrder })
  } catch (error) {
    next(error)
  }
}
