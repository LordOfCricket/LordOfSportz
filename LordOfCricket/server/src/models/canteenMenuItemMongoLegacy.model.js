// ============================================================================
// LEGACY MIGRATION TOOLING ONLY — NOT USED BY RUNTIME APPLICATION
// ============================================================================
//
// RETIRED from the live request path (MongoDB cleanup, Phase 3 — see
// docs/ARCHITECTURE.md / the Phase 0 audit report). canteenMenu.controller.js
// now reads/writes PostgreSQL's `menu_items` table via
// models/canteenMenuItem.model.js instead. This file is kept, unchanged,
// ONLY so server/src/scripts/migrateMenuItemsToPostgres.js can read the
// original MongoDB documents, and as a rollback reference (MongoDB's
// MenuItem data itself is never deleted by the migration). Do not import
// this from any new code — the canonical `MenuItem` model going forward is
// the PostgreSQL one. TodayMenu and Order remain genuinely Mongo-backed
// (unchanged, out of scope this phase) — this file has no bearing on them.
import mongoose from 'mongoose'

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    // Populated only for items uploaded after this field was added — lets
    // deleteMenuItem clean up the Cloudinary asset; legacy items (URL only,
    // no publicId) simply skip that step, same as before this field existed.
    imagePublicId: { type: String, default: '' },
    defaultStock: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export default mongoose.model('MenuItem', menuItemSchema)
