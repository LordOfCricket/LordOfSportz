import { pool } from '../config/db.js'

// MongoDB cleanup, Phase 4 — TodayMenu's storage layer, migrated from
// Mongoose to plain parameterized SQL (today_menu + today_menu_items).
// Order stays on MongoDB this phase — this file has zero knowledge of it.
// The retired Mongoose model (canteenTodayMenuMongoLegacy.model.js) is kept
// only for the one-time data migration script and rollback reference.

// "The" TodayMenu row FOR THIS CANTEEN — Phase 10 narrows the retired
// code's original convention (`TodayMenu.findOne({})`, no filter at all,
// exactly one document ever) to per-canteen: `idx_today_menu_canteen_id`'s
// UNIQUE(canteen_id) constraint guarantees at most one row per canteen, the
// direct per-tenant equivalent of the old global singleton.
export async function getTodayMenu(canteenId) {
  const { rows: menuRows } = await pool.query('SELECT * FROM today_menu WHERE canteen_id = $1 ORDER BY id LIMIT 1', [canteenId])
  const menu = menuRows[0]
  if (!menu) return null

  const { rows: items } = await pool.query(
    'SELECT * FROM today_menu_items WHERE today_menu_id = $1 ORDER BY sort_order',
    [menu.id],
  )
  return { ...menu, items }
}

// Phase 16 — dashboard low-stock widget. today_menu_items itself has no
// item name (only menu_item_id) — this joins menu_items so the dashboard
// can show a real name, not just a count, without the caller needing a
// second lookup.
export async function lowStockItemsForCanteen(canteenId, threshold) {
  const { rows } = await pool.query(
    `SELECT mi.name, tmi.stock
     FROM today_menu tm
     JOIN today_menu_items tmi ON tmi.today_menu_id = tm.id
     JOIN menu_items mi ON mi.id = tmi.menu_item_id
     WHERE tm.canteen_id = $1 AND tmi.available = true AND tmi.stock <= $2
     ORDER BY tmi.stock ASC`,
    [canteenId, threshold],
  )
  return rows
}

// Transactional replace-all (Step 12/16) — the live write path behind
// `PATCH /canteen/menu/today`. Resolves each incoming item against the
// real `menu_items` table (a real FK — see schema.sql's comment: an id
// that doesn't resolve is simply never inserted, matching the retired
// code's own read-side invisibility for such ids exactly), dedups by id
// keeping the LAST occurrence at its ORIGINAL array position (matches the
// retired code's own read-side `Object.fromEntries` "last wins" behavior),
// then deletes and reinserts every child row inside one transaction — if
// anything fails, the previous state is left completely untouched.
//
// Phase 10 Step 15 — the menu-item resolution query below is scoped
// `AND canteen_id = $canteenId`: an id that belongs to a DIFFERENT
// canteen is treated exactly like an id that doesn't exist at all (silently
// dropped, never published) — the existing "unresolvable id is simply never
// written" semantics extended to also cover "resolvable, but not yours."
// This is the invariant today_menu.canteen_id === menu_item.canteen_id for
// every published entry, enforced structurally rather than checked after
// the fact.
export async function replaceTodayMenu({ canteenId, publishedAt, items }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: existing } = await client.query('SELECT id FROM today_menu WHERE canteen_id = $1 ORDER BY id LIMIT 1', [canteenId])
    let todayMenuId
    if (existing[0]) {
      todayMenuId = existing[0].id
      await client.query('UPDATE today_menu SET published_at = $1, updated_at = NOW() WHERE id = $2', [publishedAt, todayMenuId])
    } else {
      const inserted = await client.query('INSERT INTO today_menu (canteen_id, published_at) VALUES ($1,$2) RETURNING id', [canteenId, publishedAt])
      todayMenuId = inserted.rows[0].id
    }

    await client.query('DELETE FROM today_menu_items WHERE today_menu_id = $1', [todayMenuId])

    const byId = new Map()
    items.forEach((item, index) => {
      if (item && item.id != null) byId.set(String(item.id), { item, sortOrder: index })
    })

    let insertedCount = 0
    for (const [rawId, { item, sortOrder }] of byId) {
      const numericId = Number(rawId)
      if (!Number.isInteger(numericId)) continue
      const { rows: menuItemRows } = await client.query('SELECT id FROM menu_items WHERE id = $1 AND canteen_id = $2', [numericId, canteenId])
      if (!menuItemRows[0]) continue

      await client.query(
        `INSERT INTO today_menu_items (today_menu_id, menu_item_id, available, stock, daily_price, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          todayMenuId,
          numericId,
          Boolean(item.available),
          typeof item.stock === 'number' ? item.stock : 0,
          typeof item.dailyPrice === 'number' ? item.dailyPrice : 0,
          sortOrder,
        ],
      )
      insertedCount++
    }

    await client.query('COMMIT')
    return { todayMenuId, insertedCount }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Backs deleteMenuItem's existing cross-table cleanup (Phase 1-3's own
// established behavior: deactivating a MenuItem removes it from today's
// published menu) — now a real indexed DELETE instead of an in-memory
// array filter + full-document `.save()`.
export async function deleteTodayMenuItemsByMenuItemId(menuItemId) {
  await pool.query('DELETE FROM today_menu_items WHERE menu_item_id = $1', [menuItemId])
}

// Idempotent, transactional upsert keyed on the ORIGINAL MongoDB `_id` —
// used only by the one-time Phase 4 data migration script
// (scripts/migrateTodayMenuToPostgres.js), never by the live request path.
// `resolvedItems` is pre-validated by the caller (Step 11 — the migration
// itself fails all-or-nothing on an unresolvable id, BEFORE this function
// is ever called, unlike the live write path's permissive skip-and-continue).
export async function upsertTodayMenuByLegacyMongoId({ canteenId, legacyMongoId, publishedAt, createdAt, updatedAt, resolvedItems }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: existing } = await client.query('SELECT id FROM today_menu WHERE legacy_mongo_id = $1', [legacyMongoId])
    let todayMenuId
    let inserted
    if (existing[0]) {
      todayMenuId = existing[0].id
      inserted = false
      await client.query('UPDATE today_menu SET published_at = $1, updated_at = NOW() WHERE id = $2', [publishedAt, todayMenuId])
    } else {
      inserted = true
      const row = await client.query(
        'INSERT INTO today_menu (canteen_id, published_at, created_at, updated_at, legacy_mongo_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [canteenId, publishedAt, createdAt, updatedAt, legacyMongoId],
      )
      todayMenuId = row.rows[0].id
    }

    await client.query('DELETE FROM today_menu_items WHERE today_menu_id = $1', [todayMenuId])

    for (const { menuItemId, available, stock, dailyPrice, sortOrder } of resolvedItems) {
      await client.query(
        `INSERT INTO today_menu_items (today_menu_id, menu_item_id, available, stock, daily_price, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [todayMenuId, menuItemId, available, stock, dailyPrice, sortOrder],
      )
    }

    await client.query('COMMIT')
    return { todayMenuId, inserted, itemCount: resolvedItems.length }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Resolves one TodayMenu item id against menu_items, trying BOTH forms:
// already-Postgres-format (the current live state, post-Phase-3A) and the
// general historical case (a still-old Mongo ObjectId string, resolvable
// only via legacy_mongo_id). Returns the real menu_items.id, or null if
// neither resolves — the migration script treats null as a hard failure
// (Step 4/11: stop, never invent a replacement MenuItem).
export async function resolveMenuItemId(rawId) {
  const direct = Number(rawId)
  if (Number.isInteger(direct)) {
    const { rows } = await pool.query('SELECT id FROM menu_items WHERE id = $1', [direct])
    if (rows[0]) return rows[0].id
  }
  const { rows: byLegacy } = await pool.query('SELECT id FROM menu_items WHERE legacy_mongo_id = $1', [String(rawId)])
  if (byLegacy[0]) return byLegacy[0].id
  return null
}
