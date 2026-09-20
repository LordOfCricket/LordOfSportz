import 'dotenv/config'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import { pool, connectMongo } from '../config/db.js'
import GalleryImageMongo, { GALLERY_CATEGORIES } from '../models/galleryImageMongoLegacy.model.js'
import { upsertGalleryImageByLegacyMongoId } from '../models/galleryImage.model.js'

// One-time, idempotent, resumable migration (MongoDB cleanup, Phase 1):
// copies every existing MongoDB GalleryImage document into the new
// PostgreSQL `gallery_images` table. Read-only against MongoDB (never
// deletes/updates a source document), upsert-only against PostgreSQL (keyed
// on the original `_id` via `legacy_mongo_id` — see schema.sql), so running
// this any number of times converges on the same result instead of
// duplicating rows. Never re-uploads to Cloudinary — only the existing
// url/publicId/metadata are copied, the same asset keeps being used. Mirrors
// the exact pattern already proven by
// scripts/migrateGroundMediaToCloudinary.js (skip/continue on a per-record
// failure rather than aborting the whole run, print a machine-readable
// summary, never touch the source).

function isValidDoc(doc) {
  return Boolean(
    doc.title &&
      doc.category &&
      GALLERY_CATEGORIES.includes(doc.category) &&
      doc.image &&
      doc.image.url &&
      doc.image.publicId,
  )
}

// Core migration logic, exported separately from the CLI entrypoint below so
// integration tests can call it directly (seed MongoDB fixtures, run this,
// assert on the returned summary) without spawning a subprocess or the
// side effects (`pool.end()`, `process.exit`) a standalone script needs.
export async function runGalleryMigration() {
  const docs = await GalleryImageMongo.find({}).lean()
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
      const reason = 'missing required field(s) (title/category/image.url/image.publicId)'
      skipped.push({ legacyMongoId, reason })
      results.push({ legacyMongoId, status: 'skipped', reason })
      continue
    }

    try {
      const row = await upsertGalleryImageByLegacyMongoId({
        title: doc.title,
        description: doc.description || '',
        category: doc.category,
        imageUrl: doc.image.url,
        cloudinaryPublicId: doc.image.publicId,
        imageWidth: doc.image.width ?? null,
        imageHeight: doc.image.height ?? null,
        imageFormat: doc.image.format ?? null,
        imageBytes: doc.image.bytes ?? null,
        sortOrder: doc.order ?? 0,
        isActive: doc.isActive ?? true,
        createdBy: doc.createdBy ?? null,
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
      failed.push({ legacyMongoId, title: doc.title, error: err.message })
      results.push({ legacyMongoId, status: 'FAILED', error: err.message })
    }
  }

  const { rows: verifyRows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM gallery_images WHERE legacy_mongo_id IS NOT NULL',
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

  const { summary, results, skipped, failed } = await runGalleryMigration()

  console.log('=== gallery_images migration ===')
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
