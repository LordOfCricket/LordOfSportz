import 'dotenv/config'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import { pool, connectMongo } from '../config/db.js'
import MenuItemMongo from '../models/canteenMenuItemMongoLegacy.model.js'
import { upsertMenuItemByLegacyMongoId } from '../models/canteenMenuItem.model.js'
import { findSingleCanteen } from '../models/canteen.model.js'

// One-time, idempotent, resumable migration (MongoDB cleanup, Phase 3):
// copies every existing MongoDB MenuItem document into the new PostgreSQL
// `menu_items` table. Read-only against MongoDB (never deletes/updates a
// source document), upsert-only against PostgreSQL (keyed on the original
// `_id` via `legacy_mongo_id` — see schema.sql), so running this any number
// of times converges on the same result instead of duplicating rows. Same
// pattern as scripts/migrateGalleryToPostgres.js (Phase 1) and
// scripts/migrateAiInsightsToPostgres.js (Phase 2). Never re-uploads to
// Cloudinary — only the existing url/publicId are copied. TodayMenu and
// Order are NEVER touched by this script (out of scope this phase).

function isValidDoc(doc) {
  return Boolean(doc.name && doc.category && typeof doc.price === 'number' && !Number.isNaN(doc.price))
}

// Core migration logic, exported separately from the CLI entrypoint below so
// integration tests can call it directly, matching the Phase 1/2 pattern.
export async function runMenuItemMigration() {
  // Phase 10: this migration predates multi-ground entirely (it moved
  // MenuItem out of MongoDB back in Phase 3) — every row it produces
  // belongs to the single canteen that exists in this environment.
  const canteen = await findSingleCanteen()
  if (!canteen) {
    throw new Error('No canteen exists yet — run db:seed:ground before this migration.')
  }

  const docs = await MenuItemMongo.find({}).lean()
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
      const reason = 'missing required field(s) (name/category/price)'
      skipped.push({ legacyMongoId, reason })
      results.push({ legacyMongoId, status: 'skipped', reason })
      continue
    }

    try {
      const row = await upsertMenuItemByLegacyMongoId({
        canteenId: canteen.id,
        name: doc.name,
        category: doc.category,
        description: doc.description || '',
        price: doc.price,
        imageUrl: doc.image || '',
        cloudinaryPublicId: doc.imagePublicId || '',
        defaultStock: doc.defaultStock ?? 0,
        isActive: doc.isActive ?? true,
        legacyMongoId,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      })

      if (row.inserted) {
        insertedCount++
        results.push({ legacyMongoId, status: 'inserted', postgresId: row.id })
      } else {
        updatedCount++
        results.push({ legacyMongoId, status: 'updated', postgresId: row.id })
      }
    } catch (err) {
      failedCount++
      failed.push({ legacyMongoId, name: doc.name, error: err.message })
      results.push({ legacyMongoId, status: 'FAILED', error: err.message })
    }
  }

  const { rows: verifyRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM menu_items WHERE legacy_mongo_id IS NOT NULL',
  )
  const verificationCount = verifyRows[0].count

  const summary = {
    source_count: sourceCount,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    verification_count: verificationCount,
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

  const { summary, results, skipped, failed } = await runMenuItemMigration()

  console.log('=== menu_items migration ===')
  console.log(JSON.stringify(results, null, 2))

  if (skipped.length > 0) {
    console.log('\n=== SKIPPED records ===')
    console.log(JSON.stringify(skipped, null, 2))
  }
  if (failed.length > 0) {
    console.log('\n=== FAILED records ===')
    console.log(JSON.stringify(failed, null, 2))
  }

  const expected = summary.source_count - summary.skipped_count
  if (summary.verification_count !== expected) {
    console.warn(
      `\n⚠ Verification mismatch: expected ${expected} migrated rows (source ${summary.source_count} - skipped ${summary.skipped_count}), found ${summary.verification_count} in PostgreSQL.`,
    )
  } else {
    console.log(
      `\n✅ Verification passed: ${summary.verification_count} rows in PostgreSQL match ${expected} expected (source ${summary.source_count} - skipped ${summary.skipped_count}).`,
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
