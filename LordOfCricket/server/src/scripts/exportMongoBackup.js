import 'dotenv/config'
import { mkdir, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { connectMongo, pool } from '../config/db.js'

// Phase 6 — a safe, read-only export of every remaining MongoDB collection,
// taken BEFORE any data decommissioning (Phase 6B, a separate, not-yet-
// approved phase). Writes plain JSON files outside the live database (this
// repo's server/backups/, gitignored — see docs comment there) so a
// rollback or historical audit never depends on the live MongoDB instance
// still existing. Read-only against MongoDB: no collection is modified,
// dropped, or written to by this script.

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  await connectMongo()
  const mongoose = (await import('mongoose')).default
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB is not reachable — cannot take a backup of an unreachable database.')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(__dirname, '../../backups/mongo', timestamp)
  await mkdir(backupDir, { recursive: true })

  const collections = await mongoose.connection.db.listCollections().toArray()
  const manifest = {
    timestamp: new Date().toISOString(),
    database: mongoose.connection.db.databaseName,
    collections: [],
  }

  for (const { name } of collections) {
    const docs = await mongoose.connection.db.collection(name).find({}).toArray()
    const filePath = join(backupDir, `${name}.json`)
    await writeFile(filePath, JSON.stringify(docs, null, 2))
    manifest.collections.push({ name, documentCount: docs.length, file: `${name}.json` })
    console.log(`  ${name}: ${docs.length} document(s) -> ${filePath}`)
  }

  // Cross-check against PostgreSQL's migrated row counts (legacy_mongo_id
  // IS NOT NULL) so the manifest also records, at backup time, whether
  // PostgreSQL still agrees with what's being backed up — a second,
  // independent verification alongside each phase's own migration report.
  const pgCounts = {}
  for (const [table, mongoCollection] of [
    ['gallery_images', 'galleryimages'],
    ['ai_insights', 'aiinsights'],
    ['menu_items', 'menuitems'],
    ['today_menu', 'todaymenus'],
    ['orders', 'orders'],
  ]) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE legacy_mongo_id IS NOT NULL`)
    pgCounts[mongoCollection] = { postgresTable: table, migratedRowCount: rows[0].count }
  }
  manifest.postgresCrossCheck = pgCounts

  await writeFile(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n✅ Backup complete: ${backupDir}`)
  console.log(JSON.stringify(manifest, null, 2))

  return { backupDir, manifest }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  main()
    .catch((err) => {
      console.error('Backup script crashed:', err)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
      const mongoose = (await import('mongoose')).default
      await mongoose.connection.close()
    })
}
