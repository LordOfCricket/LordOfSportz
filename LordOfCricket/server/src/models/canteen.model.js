import { pool } from '../config/db.js'

// Phase 8 — the second table in the multi-ground architecture (Phase 7
// audit §7-9). menu_items/today_menu/orders do NOT reference this table
// yet (deliberately, out of scope this phase) — this only creates the
// parent row(s) for a later phase to point at.

export async function createCanteen({ groundId, publicCanteenId, name = 'Main Canteen', isActive = true }) {
  const { rows } = await pool.query(
    `INSERT INTO canteens (ground_id, public_canteen_id, name, is_active)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [groundId, publicCanteenId, name, isActive],
  )
  return rows[0]
}

export async function findCanteensByGroundId(groundId) {
  const { rows } = await pool.query('SELECT * FROM canteens WHERE ground_id = $1 ORDER BY id', [groundId])
  return rows
}

export async function findCanteenById(id) {
  const { rows } = await pool.query('SELECT * FROM canteens WHERE id = $1', [id])
  return rows[0] || null
}

// Phase 24 — Ground Owner self-service activate/deactivate. is_active was
// only ever set once, at creation (createCanteen above) — nothing before
// this phase could change it afterward. Touches only this one row; menu
// items, today's menu, and existing orders are untouched (no cascade, no
// FK to any of those tables references is_active).
export async function updateCanteenActiveStatus(canteenId, isActive) {
  const { rows } = await pool.query(
    `UPDATE canteens SET is_active = $1 WHERE id = $2 RETURNING *`,
    [isActive, canteenId],
  )
  return rows[0] || null
}

// Phase 9 — resolves a route's :publicCanteenId param to the real canteen
// row so its ground_id can be authorized against, never taken from the
// client (see groundAccess.js's requireCanteenRole).
export async function findCanteenByPublicId(publicCanteenId) {
  const { rows } = await pool.query('SELECT * FROM canteens WHERE public_canteen_id = $1', [publicCanteenId])
  return rows[0] || null
}

// Phase 11 Step 20 — thrown instead of ever guessing which canteen to use.
// Distinguishes "genuinely ambiguous" from "not configured yet" (null) so
// callers can return a clear, honest error instead of a misleading
// "not found."
export class AmbiguousCanteenError extends Error {
  constructor() {
    super('More than one canteen exists — single-canteen resolution is no longer safe. Use the ground/canteen-scoped routes instead.')
    this.name = 'AmbiguousCanteenError'
  }
}

// Phase 10 — resolves "the" canteen for the TRANSITIONAL, pre-multi-ground
// routes (/api/canteen/menu, /api/canteen/orders — still no :publicCanteenId
// in the URL, kept operating exactly as before for the existing frontend,
// Phase 11 Step 20/30). Real multi-ground routes
// (/api/grounds/:publicGroundId/canteens/:publicCanteenId/...) never call
// this — they resolve via findCanteenByPublicId + explicit ground
// verification (groundAccess.js's requireGroundCanteenRole).
//
// Phase 11 hardening: this used to be a blind `ORDER BY id LIMIT 1` — safe
// only by coincidence while exactly one canteen existed. It now PROVES
// there is exactly one before returning it: zero canteens -> null ("not
// configured"), exactly one -> that row, more than one -> throws
// AmbiguousCanteenError rather than silently picking "canteen #1" the
// moment a second ground/canteen is ever created.
export async function findSingleCanteen() {
  const { rows } = await pool.query('SELECT * FROM canteens LIMIT 2')
  if (rows.length === 0) return null
  if (rows.length > 1) throw new AmbiguousCanteenError()
  return rows[0]
}
