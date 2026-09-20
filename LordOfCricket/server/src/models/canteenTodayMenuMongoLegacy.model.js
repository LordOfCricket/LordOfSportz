// ============================================================================
// LEGACY MIGRATION TOOLING ONLY — NOT USED BY RUNTIME APPLICATION
// ============================================================================
//
// RETIRED from the live request path (MongoDB cleanup, Phase 4 — see
// docs/ARCHITECTURE.md / the Phase 0 audit report). canteenMenu.controller.js
// now reads/writes PostgreSQL's `today_menu`/`today_menu_items` tables via
// models/canteenTodayMenu.model.js instead. This file is kept, unchanged,
// ONLY so server/src/scripts/migrateTodayMenuToPostgres.js can read the
// original MongoDB document, and as a rollback reference (MongoDB's
// TodayMenu data itself is never deleted by the migration). Do not import
// this from any new code — the canonical `TodayMenu` model going forward is
// the PostgreSQL one. Order remains genuinely Mongo-backed (unchanged, out
// of scope this phase) — this file has no bearing on it.
import mongoose from 'mongoose'

const todayMenuSchema = new mongoose.Schema(
  {
    publishedAt: { type: Date, default: Date.now },
    items: [
      {
        id: { type: String, required: true },
        available: { type: Boolean, default: false },
        stock: { type: Number, default: 0 },
        dailyPrice: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true },
)

export default mongoose.model('TodayMenu', todayMenuSchema)
