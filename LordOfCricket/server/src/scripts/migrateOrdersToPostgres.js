import 'dotenv/config'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import { pool, connectMongo } from '../config/db.js'
import OrderMongo from '../models/canteenOrderMongoLegacy.model.js'
import { upsertOrderByLegacyMongoId, resolveMenuItemId, resolveStatus, PRESET_STATUS } from '../models/canteenOrder.model.js'
import { findSingleCanteen } from '../models/canteen.model.js'

// One-time, idempotent, resumable migration (MongoDB cleanup, Phase 5 —
// the FINAL business feature): copies every existing MongoDB Order
// document into PostgreSQL's `orders` + `order_items`. Read-only against
// MongoDB (never deletes/updates a source document), upsert-only against
// PostgreSQL (keyed on the original `_id` via `legacy_mongo_id`), so
// running this any number of times converges on the same result. Unlike
// Phase 4's TodayMenu (a true singleton, all-or-nothing), Order is a LIST
// of many independent historical records — same per-record fault-tolerant
// pattern as Phase 1/2/3 (skip/fail one record, keep going), but EACH
// order's own root+items write is still fully transactional (Step 17):
// an order is never left without its complete item set, and a failure on
// one order never touches any other order's data.

function isValidDoc(doc) {
  return Boolean(
    doc.userId != null &&
      typeof doc.total === 'number' &&
      !Number.isNaN(doc.total) &&
      Array.isArray(doc.items) &&
      doc.items.length > 0,
  )
}

// Core migration logic, exported separately from the CLI entrypoint below so
// integration tests can call it directly, matching the Phase 1/2/3 pattern.
export async function runOrderMigration() {
  // Phase 10: this migration predates multi-ground entirely — every
  // historical MongoDB order belongs to the single canteen that exists in
  // this environment.
  const canteen = await findSingleCanteen()
  if (!canteen) {
    throw new Error('No canteen exists yet — run db:seed:ground before this migration.')
  }

  const docs = await OrderMongo.find({}).lean()
  const sourceCount = docs.length

  let insertedCount = 0
  let updatedCount = 0
  let skippedCount = 0
  let failedCount = 0
  const skipped = []
  const failed = []
  const results = []

  for (const doc of docs) {
    const legacyMongoId = String(doc._id)

    if (!isValidDoc(doc)) {
      skippedCount++
      const reason = 'missing required field(s) (userId/total/items)'
      skipped.push({ legacyMongoId, reason })
      results.push({ legacyMongoId, status: 'skipped', reason })
      continue
    }

    const normalizedStatus = resolveStatus(doc.status)
    if (!PRESET_STATUS.includes(normalizedStatus)) {
      // A genuinely unrecognized status is a real data-quality problem —
      // never guessed at or silently coerced (Step 10: "do not silently
      // rename statuses").
      failedCount++
      const error = `unrecognized status '${doc.status}' (normalized: '${normalizedStatus}') is not one of ${PRESET_STATUS.join(', ')}`
      failed.push({ legacyMongoId, error })
      results.push({ legacyMongoId, status: 'FAILED', error })
      continue
    }

    try {
      // Step 17 — resolve every item BEFORE opening the write transaction
      // (mirrors Phase 4's own "validate everything, then write" shape),
      // then upsertOrderByLegacyMongoId does order+items atomically.
      const resolvedItems = []
      for (const item of doc.items) {
        const rawItemId = String(item.id ?? item.foodId ?? '')
        const menuItemId = await resolveMenuItemId(pool, rawItemId, canteen.id)
        resolvedItems.push({
          menuItemId,
          rawItemId,
          itemName: item.name,
          unitPrice: item.price,
          quantity: item.qty,
        })
      }

      const { orderId, publicOrderId, inserted, itemCount } = await upsertOrderByLegacyMongoId({
        canteenId: canteen.id,
        legacyMongoId,
        userId: doc.userId,
        customerName: doc.customerName || '',
        seatId: doc.seatId || 'unknown',
        total: doc.total,
        status: normalizedStatus,
        // Faithful passthrough of the actual stored flag — never re-derived
        // from status. If the source data were ever genuinely inconsistent
        // (two "active" orders for one user), the partial unique index
        // correctly fails this record loudly rather than silently
        // importing a broken invariant.
        hasActiveOrderFlag: doc.hasActiveOrderFlag === true ? true : null,
        orderedAt: doc.orderedAt ?? doc.createdAt ?? new Date(),
        completedAt: doc.completedAt ?? null,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
        resolvedItems,
      })

      if (inserted) {
        insertedCount++
        results.push({ legacyMongoId, status: 'inserted', postgresId: orderId, publicOrderId, itemCount })
      } else {
        updatedCount++
        results.push({ legacyMongoId, status: 'updated', postgresId: orderId, publicOrderId, itemCount })
      }
    } catch (err) {
      failedCount++
      failed.push({ legacyMongoId, userId: doc.userId, error: err.message })
      results.push({ legacyMongoId, status: 'FAILED', error: err.message })
    }
  }

  const { rows: verifyRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM orders WHERE legacy_mongo_id IS NOT NULL',
  )
  const { rows: statusCounts } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM orders WHERE legacy_mongo_id IS NOT NULL GROUP BY status`,
  )
  const countByStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r.count]))

  const summary = {
    source_count: sourceCount,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    verification_count: verifyRows[0].count,
    active_order_count: ['Pending', 'Accepted', 'Preparing', 'Ready'].reduce((sum, s) => sum + (countByStatus[s] || 0), 0),
    completed_order_count: countByStatus.Completed || 0,
    cancelled_order_count: countByStatus.Cancelled || 0,
  }

  return { summary, results, skipped, failed }
}

async function main() {
  await connectMongo()
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      'MongoDB is not reachable — this migration needs the source database. Aborting (no PostgreSQL writes were attempted).',
    )
  }

  const { summary, results, skipped, failed } = await runOrderMigration()

  console.log('=== orders migration ===')
  console.log(JSON.stringify(results, null, 2))

  if (skipped.length > 0) {
    console.log('\n=== SKIPPED records ===')
    console.log(JSON.stringify(skipped, null, 2))
  }
  if (failed.length > 0) {
    console.log('\n=== FAILED records ===')
    console.log(JSON.stringify(failed, null, 2))
  }

  const expected = summary.source_count - summary.skipped_count - summary.failed_count
  if (summary.verification_count !== expected) {
    console.warn(
      `\n⚠ Verification mismatch: expected ${expected} migrated rows (source ${summary.source_count} - skipped ${summary.skipped_count} - failed ${summary.failed_count}), found ${summary.verification_count} in PostgreSQL.`,
    )
  } else {
    console.log(
      `\n✅ Verification passed: ${summary.verification_count} rows in PostgreSQL match ${expected} expected.`,
    )
  }

  console.log(`\n=== SUMMARY ===\n${JSON.stringify(summary, null, 2)}`)

  if (summary.failed_count > 0) process.exitCode = 1
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main()
    .catch((err) => {
      console.error('Migration script crashed:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
      await mongoose.connection.close()
    })
}
