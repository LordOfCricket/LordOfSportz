// ============================================================================
// LEGACY MIGRATION TOOLING ONLY — NOT USED BY RUNTIME APPLICATION
// ============================================================================
//
// RETIRED from the live request path (MongoDB cleanup, Phase 5 — the FINAL
// MongoDB-backed business feature — see docs/ARCHITECTURE.md / the Phase 0
// audit report). canteenOrder.controller.js now reads/writes PostgreSQL's
// `orders`/`order_items` tables via models/canteenOrder.model.js instead.
// This file is kept, unchanged, ONLY so
// server/src/scripts/migrateOrdersToPostgres.js can read the original
// MongoDB documents, and as a rollback reference (MongoDB's Order data
// itself is never deleted by the migration). Do not import this from any
// new code — the canonical `Order` model going forward is the PostgreSQL
// one. MongoDB itself, Mongoose, connectMongo()/isMongoReady()/MONGO_URI
// all remain fully wired per this phase's explicit instructions — only
// Order's own runtime dependency on this specific file is retired.
import mongoose from 'mongoose'

const orderSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true },
    customerName: { type: String, default: '' },
    seatId: { type: String, default: 'unknown' },
    items: [{ id: String, foodId: String, name: String, price: Number, qty: Number }],
    total: { type: Number, required: true },
    status: { type: String, default: 'Pending' },
    orderedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    // Phase 14 — the real concurrency guard for "one active order per user."
    // `findOne` then `create` (the previous check) is two round-trips with no
    // atomicity between them; a genuine double-click race could create two
    // active orders. This field + the partial unique index below make MongoDB
    // itself reject a second concurrent active order (duplicate-key error),
    // not just a same-process JS check. Only ever `true` while the order is
    // active; unset (not `false`) once it reaches a terminal status, so the
    // partial index — which can only express equality, not `$in` — correctly
    // stops applying to that document. `status` itself is untouched.
    hasActiveOrderFlag: { type: Boolean },
  },
  { timestamps: true },
)

orderSchema.index(
  { userId: 1, hasActiveOrderFlag: 1 },
  { unique: true, partialFilterExpression: { hasActiveOrderFlag: true } },
)

export default mongoose.model('Order', orderSchema)
