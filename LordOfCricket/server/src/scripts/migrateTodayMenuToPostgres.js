import 'dotenv/config'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import { pool, connectMongo } from '../config/db.js'
import TodayMenuMongo from '../models/canteenTodayMenuMongoLegacy.model.js'
import { upsertTodayMenuByLegacyMongoId, resolveMenuItemId } from '../models/canteenTodayMenu.model.js'
import { findSingleCanteen } from '../models/canteen.model.js'

// One-time, idempotent, resumable, TRANSACTIONAL migration (MongoDB
// cleanup, Phase 4): copies the single MongoDB TodayMenu document into
// PostgreSQL's `today_menu` + `today_menu_items`. Read-only against
// MongoDB (never deletes/updates the source document), upsert-only against
// PostgreSQL (keyed on the original `_id` via `legacy_mongo_id`), so
// running this any number of times converges on the same result. Unlike
// Phase 1/2/3's per-record scripts, TodayMenu is a SINGLETON — there is at
// most one MongoDB document and at most one PostgreSQL row — so this
// migration is all-or-nothing for that one document (Step 11): if ANY item
// fails to resolve against a real `menu_items` row, NOTHING is written to
// PostgreSQL and the whole run is reported as a failure. This is
// deliberately stricter than the live `PATCH /canteen/menu/today` write
// path (which silently skips an unresolvable id and still succeeds) —
// the live endpoint is publishing NEW data a staff member just submitted
// and controls; this migration is transcribing EXISTING historical data,
// where an unresolvable id means the source itself is inconsistent and
// deserves a loud failure, not a silent partial migration.

// Core migration logic, exported separately from the CLI entrypoint below so
// integration tests can call it directly, matching the Phase 1/2/3 pattern.
export async function runTodayMenuMigration() {
  const doc = await TodayMenuMongo.findOne({}).lean()

  if (!doc) {
    return {
      summary: {
        source_count: 0,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        failed_count: 0,
        verification_count: 0,
      },
      status: 'no_source_document',
      items_migrated: 0,
      unresolved: [],
    }
  }

  const rawItems = Array.isArray(doc.items) ? doc.items : []
  const legacyMongoId = String(doc._id)

  // Step 11 — validate EVERY item before writing anything. Resolution
  // (resolveMenuItemId) tries both forms an item id can legitimately be in
  // right now: already-Postgres-format (the current live state, thanks to
  // Phase 3A's remediation) or a still-old Mongo ObjectId string
  // (resolvable only via menu_items.legacy_mongo_id) — see Step 4/§15 of
  // the Phase 3 report for why both forms can exist.
  const unresolved = []
  const resolvedItems = []
  for (let index = 0; index < rawItems.length; index++) {
    const entry = rawItems[index]
    const menuItemId = await resolveMenuItemId(entry.id)
    if (menuItemId === null) {
      unresolved.push({ rawId: entry.id, index })
      continue
    }
    resolvedItems.push({
      menuItemId,
      available: Boolean(entry.available),
      stock: typeof entry.stock === 'number' ? entry.stock : 0,
      dailyPrice: typeof entry.dailyPrice === 'number' ? entry.dailyPrice : 0,
      sortOrder: index,
    })
  }

  if (unresolved.length > 0) {
    // STOP — per Step 4/11, never write a partial result and never invent
    // a replacement MenuItem for an id that doesn't resolve.
    return {
      summary: {
        source_count: 1,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        failed_count: 1,
        verification_count: 0,
      },
      status: 'ABORTED_UNRESOLVED_ITEMS',
      items_migrated: 0,
      unresolved,
    }
  }

  try {
    // Phase 10: this migration predates multi-ground entirely — the single
    // MongoDB TodayMenu document belongs to the single canteen that exists
    // in this environment.
    const canteen = await findSingleCanteen()
    if (!canteen) throw new Error('No canteen exists yet — run db:seed:ground before this migration.')

    const { todayMenuId, inserted, itemCount } = await upsertTodayMenuByLegacyMongoId({
      canteenId: canteen.id,
      legacyMongoId,
      publishedAt: doc.publishedAt ?? new Date(),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
      resolvedItems,
    })

    const { rows: verifyRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM today_menu_items WHERE today_menu_id = $1',
      [todayMenuId],
    )

    return {
      summary: {
        source_count: 1,
        inserted_count: inserted ? 1 : 0,
        updated_count: inserted ? 0 : 1,
        skipped_count: 0,
        failed_count: 0,
        verification_count: verifyRows[0].count,
      },
      status: 'OK',
      todayMenuId,
      items_migrated: itemCount,
      unresolved: [],
    }
  } catch (err) {
    return {
      summary: {
        source_count: 1,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        failed_count: 1,
        verification_count: 0,
      },
      status: 'ABORTED_DB_ERROR',
      error: err.message,
      items_migrated: 0,
      unresolved: [],
    }
  }
}

async function main() {
  await connectMongo()
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      'MongoDB is not reachable — this migration needs the source database. Aborting (no PostgreSQL writes were attempted).',
    )
  }

  const result = await runTodayMenuMigration()
  console.log('=== today_menu migration ===')
  console.log(JSON.stringify(result, null, 2))

  const { summary } = result
  if (summary.failed_count > 0) {
    console.error(`\n❌ Migration ABORTED (${result.status}) — no PostgreSQL rows were written or changed.`)
    process.exitCode = 1
  } else if (summary.source_count === 0) {
    console.log('\nℹ No MongoDB TodayMenu document exists — nothing to migrate.')
  } else {
    console.log(
      `\n✅ Verification passed: ${summary.verification_count} today_menu_items rows match ${result.items_migrated} resolved source items.`,
    )
  }
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
