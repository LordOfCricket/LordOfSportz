import { pool } from '../config/db.js'
import { generatePublicId } from '../utils/publicId.js'

// MongoDB cleanup, Phase 5 (final feature) — Order's storage layer,
// migrated from Mongoose to plain parameterized SQL (orders + order_items).
// This is the last MongoDB-backed business feature; after this, MongoDB
// itself remains wired (per this phase's explicit instructions) but no
// live application feature depends on it anymore. The retired Mongoose
// model (canteenOrderMongoLegacy.model.js) is kept only for the one-time
// data migration script and rollback reference.

// The exact 6 values PRESET_STATUS already enforced for every new write in
// the retired controller — see schema.sql's CHECK constraint (same list).
export const PRESET_STATUS = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']
// Legacy display-only names the retired code's LEGACY_STATUS_MAP normalized
// on read — never written going forward (see resolveStatus below), but
// still meaningful for anything that predates this migration.
export const LEGACY_STATUS_MAP = { 'Order Placed': 'Pending', Prepared: 'Ready', 'Ready for Pickup': 'Ready' }
// Statuses considered "active" for the one-active-order-per-user rule.
// Unlike the retired code's ACTIVE_STATUSES (which also listed the legacy
// names defensively, since old Mongo documents could carry them verbatim),
// every Postgres row's status is normalized at write/migration time (see
// resolveStatus), so the legacy names can never appear here — this list is
// intentionally the 4 non-terminal PRESET_STATUS values only.
export const ACTIVE_STATUSES = ['Pending', 'Accepted', 'Preparing', 'Ready']
export const FINISHED_STATUSES = ['Completed', 'Cancelled']

export function resolveStatus(status) {
  return LEGACY_STATUS_MAP[status] || status
}

function attachItems(orderRow, itemRows) {
  return {
    ...orderRow,
    items: itemRows.map((row) => ({
      id: row.raw_item_id,
      foodId: row.raw_item_id,
      name: row.item_name,
      price: Number(row.unit_price),
      qty: row.quantity,
    })),
  }
}

async function fetchItemsForOrders(client, orderIds) {
  if (orderIds.length === 0) return new Map()
  const { rows } = await client.query('SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id', [orderIds])
  const byOrderId = new Map()
  for (const row of rows) {
    if (!byOrderId.has(row.order_id)) byOrderId.set(row.order_id, [])
    byOrderId.get(row.order_id).push(row)
  }
  return byOrderId
}

// Resolves one order item's raw id against menu_items — tries BOTH forms:
// already-Postgres-format (an id a client fetched from the now-Postgres-
// backed /canteen/menu) and the general historical case (an old Mongo
// ObjectId string, resolvable only via legacy_mongo_id). Returns null (not
// an error) when neither resolves — Order never validates against
// MenuItem, at creation or afterward (proven in Phase 3's test suite), so
// an unresolvable id is a normal, expected outcome, not a failure.
//
// Phase 10 Step 14/Invariant 5 — both lookups are scoped `AND canteen_id =
// $canteenId`. This is a deliberate, narrower enforcement than "reject the
// whole order": Order's existing, tested business rule is that item id/
// name/price are entirely client-supplied and snapshotted verbatim, with
// or without a resolvable MenuItem (order_items.menu_item_id is nullable
// precisely for this — see schema.sql). Hard-rejecting a cross-canteen id
// would break that already-proven behavior and the API-compatibility
// requirement (Step 23). Instead, a real menu_items row belonging to a
// DIFFERENT canteen is treated exactly like "does not exist" — resolves to
// null — so the order is still created (unchanged from today), but
// order_items.menu_item_id can structurally never point at another
// canteen's menu item. See the Phase 10 report's "Order ownership" section
// for the full reasoning.
export async function resolveMenuItemId(client, rawId, canteenId) {
  const direct = Number(rawId)
  if (Number.isInteger(direct)) {
    const { rows } = await client.query('SELECT id FROM menu_items WHERE id = $1 AND canteen_id = $2', [direct, canteenId])
    if (rows[0]) return rows[0].id
  }
  const { rows: byLegacy } = await client.query('SELECT id FROM menu_items WHERE legacy_mongo_id = $1 AND canteen_id = $2', [String(rawId), canteenId])
  if (byLegacy[0]) return byLegacy[0].id
  return null
}

// Transactional create (Step 12/17) — order + all its items commit
// together, or neither does. The active-order guarantee itself is NOT this
// function's job to check-then-insert (race-prone); it's the database's
// `idx_orders_one_active_per_user` partial unique index, enforced the
// instant the INSERT runs. A violation surfaces as a real Postgres error
// (code 23505) that the caller (createOrder) catches and translates to the
// same 409 the retired Mongo E11000 path already produced — never
// swallowed or retried here.
export async function insertOrder({ userId, canteenId, customerName, seatId, items, total }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const publicOrderId = generatePublicId('ORD', 8)
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status, has_active_order_flag)
       VALUES ($1,$2,$3,$4,$5,$6,'Pending',true)
       RETURNING *`,
      [publicOrderId, userId, canteenId, customerName, seatId, total],
    )
    const order = orderRows[0]

    const itemRows = []
    for (const item of items) {
      const rawItemId = String(item.id ?? item.foodId ?? '')
      const menuItemId = await resolveMenuItemId(client, rawItemId, canteenId)
      const { rows } = await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, raw_item_id, item_name, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [order.id, menuItemId, rawItemId, item.name, item.price, item.qty],
      )
      itemRows.push(rows[0])
    }

    await client.query('COMMIT')
    return attachItems(order, itemRows)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function findActiveOrderByUserId(userId, canteenId) {
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE user_id = $1 AND canteen_id = $2 AND has_active_order_flag = true
     ORDER BY ordered_at DESC, created_at DESC LIMIT 1`,
    [userId, canteenId],
  )
  const order = rows[0]
  if (!order) return null
  const itemsByOrder = await fetchItemsForOrders(pool, [order.id])
  return attachItems(order, itemsByOrder.get(order.id) || [])
}

// Phase 10 Step 26 — scoped by canteenId, not just public_order_id: a
// well-formed order id belonging to a DIFFERENT canteen returns null here,
// identical to "does not exist" at every call site (getOrder/
// updateOrderStatus), so a canteen's staff can never read or mutate another
// canteen's order merely by knowing/guessing its public id.
export async function findOrderById(publicOrderId, canteenId) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE public_order_id = $1 AND canteen_id = $2', [publicOrderId, canteenId])
  const order = rows[0]
  if (!order) return null
  const itemsByOrder = await fetchItemsForOrders(pool, [order.id])
  return attachItems(order, itemsByOrder.get(order.id) || [])
}

// Socket.IO's join-order-room handler (server.js) has no route/canteen
// context to resolve a canteenId from — it only ever receives the orderId
// payload the client already holds. Safe without the canteen_id filter
// above: public_order_id is a table-wide UNIQUE column (schema.prisma), not
// composite-unique with canteen_id, so it already identifies exactly one
// order regardless of which canteen issued it. The real authorization
// boundary for this lookup is the caller checking the returned order's
// userId against the requesting socket's authenticated user — same as
// getActiveOrder/getOrderHistory, not canteen isolation.
export async function findOrderByPublicId(publicOrderId) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE public_order_id = $1', [publicOrderId])
  const order = rows[0]
  if (!order) return null
  const itemsByOrder = await fetchItemsForOrders(pool, [order.id])
  return attachItems(order, itemsByOrder.get(order.id) || [])
}

export async function findLatestOrderByUserId(userId, canteenId) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 AND canteen_id = $2 ORDER BY created_at DESC LIMIT 1',
    [userId, canteenId],
  )
  const order = rows[0]
  if (!order) return null
  const itemsByOrder = await fetchItemsForOrders(pool, [order.id])
  return attachItems(order, itemsByOrder.get(order.id) || [])
}

export async function findOrderHistoryByUserId(userId, canteenId) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE user_id = $1 AND canteen_id = $2 ORDER BY ordered_at DESC, created_at DESC',
    [userId, canteenId],
  )
  if (rows.length === 0) return []
  const itemsByOrder = await fetchItemsForOrders(pool, rows.map((r) => r.id))
  return rows.map((order) => attachItems(order, itemsByOrder.get(order.id) || []))
}

export async function listOrdersPaginated({ canteenId, activeOnly, page, limit }) {
  const skip = (page - 1) * limit
  const params = [canteenId]
  let whereClause = 'WHERE canteen_id = $1'
  if (activeOnly) {
    params.push(ACTIVE_STATUSES)
    whereClause += ` AND status = ANY($${params.length})`
  }

  const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM orders ${whereClause}`, params)
  const { rows } = await pool.query(
    `SELECT * FROM orders ${whereClause} ORDER BY ordered_at DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, skip],
  )
  const itemsByOrder = await fetchItemsForOrders(pool, rows.map((r) => r.id))
  return {
    total: countRows[0].count,
    orders: rows.map((order) => attachItems(order, itemsByOrder.get(order.id) || [])),
  }
}

// Status transition (Step 16/25/26) — a terminal transition stamps
// completed_at (the SAME field for both Completed and Cancelled, matching
// the retired code exactly — no separate cancelled_at exists there) and
// clears has_active_order_flag to NULL so the partial unique index stops
// applying, freeing the user to place a new order.
//
// Phase 10 Step 26 — `AND canteen_id = $3` in the WHERE clause makes this
// an ownership-enforced UPDATE, not a fetch-then-check: a request for a
// real order id belonging to a different canteen updates zero rows and
// returns null, identical to "order not found."
//
// Phase 21.4 — `AND status IS DISTINCT FROM $1` makes a repeat transition to
// the SAME status (e.g. a staff double-click on "Mark Completed" before the
// UI updates) a genuine no-op at the database level: zero rows match, so the
// caller does not re-stamp completed_at/updated_at and — critically — does
// not re-emit a socket event or re-notify the Ground Owner for a transition
// that already happened. The controller distinguishes this no-op case from
// a true "order not found" via a separate lookup (see canteenOrder.controller.js).
export async function updateOrderStatusByPublicId(publicOrderId, canteenId, status) {
  const isFinished = FINISHED_STATUSES.includes(status)
  const { rows } = await pool.query(
    `UPDATE orders SET
       status = $1,
       completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
       has_active_order_flag = CASE WHEN $2 THEN NULL ELSE has_active_order_flag END,
       updated_at = NOW()
     WHERE public_order_id = $3 AND canteen_id = $4 AND status IS DISTINCT FROM $1
     RETURNING *`,
    [status, isFinished, publicOrderId, canteenId],
  )
  const order = rows[0]
  if (!order) return null
  const itemsByOrder = await fetchItemsForOrders(pool, [order.id])
  return attachItems(order, itemsByOrder.get(order.id) || [])
}

// Idempotent, transactional upsert keyed on the ORIGINAL MongoDB `_id` —
// used only by the one-time Phase 5 data migration script
// (scripts/migrateOrdersToPostgres.js), never by the live request path.
export async function upsertOrderByLegacyMongoId({ canteenId, legacyMongoId, userId, customerName, seatId, total, status, hasActiveOrderFlag, orderedAt, completedAt, createdAt, updatedAt, resolvedItems }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: existing } = await client.query('SELECT id, public_order_id FROM orders WHERE legacy_mongo_id = $1', [legacyMongoId])
    let orderId
    let publicOrderId
    let inserted
    if (existing[0]) {
      orderId = existing[0].id
      publicOrderId = existing[0].public_order_id
      inserted = false
      await client.query(
        `UPDATE orders SET user_id=$1, customer_name=$2, seat_id=$3, total=$4, status=$5,
           has_active_order_flag=$6, ordered_at=$7, completed_at=$8, updated_at=NOW()
         WHERE id = $9`,
        [userId, customerName, seatId, total, status, hasActiveOrderFlag, orderedAt, completedAt, orderId],
      )
    } else {
      inserted = true
      publicOrderId = generatePublicId('ORD', 8)
      const row = await client.query(
        `INSERT INTO orders (public_order_id, user_id, canteen_id, customer_name, seat_id, total, status,
           has_active_order_flag, ordered_at, completed_at, created_at, updated_at, legacy_mongo_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [publicOrderId, userId, canteenId, customerName, seatId, total, status, hasActiveOrderFlag, orderedAt, completedAt, createdAt, updatedAt, legacyMongoId],
      )
      orderId = row.rows[0].id
    }

    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId])
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, raw_item_id, item_name, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, item.menuItemId, item.rawItemId, item.itemName, item.unitPrice, item.quantity],
      )
    }

    await client.query('COMMIT')
    return { orderId, publicOrderId, inserted, itemCount: resolvedItems.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Phase 14 — Ground Owner canteen revenue. 'Completed' is the ONLY status
// counted as revenue: PRESET_STATUS/FINISHED_STATUSES above already
// establish 'Completed' and 'Cancelled' as the two distinct terminal
// outcomes for an order — a cancelled order was never actually sold, so
// counting it as revenue would overstate real earnings. A ground can have
// multiple canteens (canteens.ground_id, Step 18) — this SUMs across every
// canteen belonging to the ground, not just one. Date-range filters on
// ordered_at (when the sale was placed), matching how booking analytics
// filters on ground_bookings.start_time — the moment the transaction
// happened, not an administrative timestamp.
export async function sumCompletedRevenueForGround(groundId, fromUtc, toUtc) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(o.total), 0)::numeric(12,2) AS revenue, COUNT(*)::int AS order_count
     FROM orders o
     JOIN canteens c ON c.id = o.canteen_id
     WHERE c.ground_id = $1 AND o.status = 'Completed' AND o.ordered_at >= $2 AND o.ordered_at < $3`,
    [groundId, fromUtc, toUtc],
  )
  return { revenue: Number(rows[0].revenue), orderCount: rows[0].order_count }
}

// Phase 16 — today's canteen order status distribution for the dashboard
// (pending/preparing/ready/completed counts). Every PRESET_STATUS value is
// counted, not just the "revenue" ones — this is an operational snapshot,
// not a financial one. Same multi-canteen SUM-across-the-ground pattern as
// sumCompletedRevenueForGround above.
export async function countOrdersByStatusForGround(groundId, fromUtc, toUtc) {
  const { rows } = await pool.query(
    `SELECT o.status, COUNT(*)::int AS count
     FROM orders o
     JOIN canteens c ON c.id = o.canteen_id
     WHERE c.ground_id = $1 AND o.ordered_at >= $2 AND o.ordered_at < $3
     GROUP BY o.status`,
    [groundId, fromUtc, toUtc],
  )
  return rows
}

// Phase 16 — top-selling items for the dashboard. Joins order_items (the
// real per-line-item quantities, already written by insertOrder above) —
// 'Completed' orders only, matching sumCompletedRevenueForGround's own
// revenue-recognition rule (a cancelled order's items were never actually
// sold). One query, no per-item follow-up lookups.
export async function topSellingItemsForGround(groundId, fromUtc, toUtc, limit = 5) {
  const { rows } = await pool.query(
    `SELECT oi.item_name, SUM(oi.quantity)::int AS quantity_sold
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN canteens c ON c.id = o.canteen_id
     WHERE c.ground_id = $1 AND o.status = 'Completed' AND o.ordered_at >= $2 AND o.ordered_at < $3
     GROUP BY oi.item_name
     ORDER BY quantity_sold DESC
     LIMIT $4`,
    [groundId, fromUtc, toUtc, limit],
  )
  return rows
}

// Phase 16 — canteen sales trend (day-by-day revenue), one GROUP BY query
// for the whole range — never a per-day loop (N+1). date_trunc uses the
// database session timezone; see groundOwnerAnalytics.service.js#getTrends
// for why that's an accepted, documented approximation for a trend chart
// (unlike a financial total, which stays ordered_at range-filtered exactly).
export async function dailyRevenueForGround(groundId, fromUtc, toUtc) {
  const { rows } = await pool.query(
    `SELECT date_trunc('day', o.ordered_at)::date AS day, COALESCE(SUM(o.total), 0)::numeric(12,2) AS revenue
     FROM orders o
     JOIN canteens c ON c.id = o.canteen_id
     WHERE c.ground_id = $1 AND o.status = 'Completed' AND o.ordered_at >= $2 AND o.ordered_at < $3
     GROUP BY 1
     ORDER BY 1`,
    [groundId, fromUtc, toUtc],
  )
  return rows.map((r) => ({ day: r.day, revenue: Number(r.revenue) }))
}
