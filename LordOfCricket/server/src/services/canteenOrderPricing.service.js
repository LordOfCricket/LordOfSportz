import { findActiveMenuItemsByCanteenId } from '../models/canteenMenuItem.model.js'
import { getTodayMenu } from '../models/canteenTodayMenu.model.js'

// Phase 17.1 — the single authoritative source for "what can this canteen
// sell right now, at what price." Extracted from canteenMenu.controller.js
// #listMenu's own indexTodayMenuItems/price-fallback logic (never
// duplicated) so the customer-facing menu browse and server-side order
// validation can NEVER diverge: whatever price/availability a customer was
// shown is exactly what createOrder below will resolve and charge.
//
// Fallback semantics mirror listMenu exactly: a canteen that has never
// published a "today's menu" for an item still sells it, at its base
// menu_items.price and default_stock — this is an existing, supported
// state (confirmed: listMenu has always treated "no today-setting" as
// "available via defaults"), not a gap this phase invents new behavior to
// close.
export async function resolveOrderableMenu(canteenId) {
  const [items, today] = await Promise.all([findActiveMenuItemsByCanteenId(canteenId), getTodayMenu(canteenId)])

  const settingsByItemId = new Map()
  if (today && Array.isArray(today.items)) {
    for (const row of today.items) settingsByItemId.set(row.menu_item_id, row)
  }

  const byId = new Map()
  for (const item of items) {
    const setting = settingsByItemId.get(item.id)
    byId.set(item.id, {
      id: item.id,
      name: item.name,
      price: setting ? Number(setting.daily_price) : Number(item.price),
      available: setting ? setting.available : true,
      stock: setting ? setting.stock : item.default_stock,
    })
  }
  return byId
}

// Phase 17.1 — integer-cents arithmetic, never floating-point money math.
// Every stored price is NUMERIC(8,2)/NUMERIC(10,2) (Postgres exact decimal,
// at most 2 fractional digits) — multiplying/summing those as JS doubles
// risks the classic 0.1+0.2 representation drift. Converting to integer
// paise, doing all arithmetic in integers, and converting back once at the
// end is the standard safe pattern for exactly this shape of problem.
function toPaise(amount) {
  return Math.round(Number(amount) * 100)
}

// Resolves and validates a client-submitted cart against the authoritative
// menu, returning server-computed line items + total. Client-supplied
// price/name fields are never read — only `id`/`foodId` (which item) and
// `qty` (how many) cross the trust boundary. Throws CanteenOrderError with
// a specific reason for the first invalid line found; the caller decides
// the HTTP status (see errors.js-style code below).
export class CanteenOrderPricingError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function resolveOrderLines(cartItems, orderableMenu) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new CanteenOrderPricingError('EMPTY_ORDER', 'Order payload is invalid.')
  }

  let totalPaise = 0
  const resolvedItems = []

  for (const cartItem of cartItems) {
    const rawId = cartItem.id ?? cartItem.foodId
    const menuItemId = Number(rawId)
    const qty = Number(cartItem.qty)

    if (!Number.isInteger(qty) || qty <= 0) {
      throw new CanteenOrderPricingError('INVALID_QUANTITY', `Invalid quantity for item ${rawId}.`)
    }

    const resolved = Number.isInteger(menuItemId) ? orderableMenu.get(menuItemId) : null
    if (!resolved) {
      throw new CanteenOrderPricingError('ITEM_NOT_FOUND', `Item ${rawId} is not available from this canteen.`)
    }
    if (!resolved.available) {
      throw new CanteenOrderPricingError('ITEM_UNAVAILABLE', `${resolved.name} is currently unavailable.`)
    }
    if (typeof resolved.stock === 'number' && qty > resolved.stock) {
      throw new CanteenOrderPricingError('INSUFFICIENT_STOCK', `Only ${resolved.stock} of ${resolved.name} left in stock.`)
    }

    const unitPricePaise = toPaise(resolved.price)
    const linePaise = unitPricePaise * qty
    totalPaise += linePaise

    resolvedItems.push({
      menuItemId: resolved.id,
      rawItemId: String(rawId),
      name: resolved.name,
      unitPrice: unitPricePaise / 100,
      qty,
    })
  }

  return { items: resolvedItems, total: totalPaise / 100 }
}
