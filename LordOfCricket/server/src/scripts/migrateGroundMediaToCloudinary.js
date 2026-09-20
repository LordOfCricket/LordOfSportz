import 'dotenv/config'
import { readFile } from 'fs/promises'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../config/db.js'
import { uploadImageFileDetailed } from '../utils/cloudinaryUpload.js'

// One-time, idempotent migration (Phase 10, 3D homepage project): moves the
// existing local-disk-served ground_photos/amenities rows to Cloudinary.
// Safe to re-run — any row whose image_url is no longer a local /uploads/
// URL is skipped, so a partial prior run resumes cleanly rather than
// re-uploading or double-charging Cloudinary storage for the same asset.
//
// Never deletes the local file itself — this script's only job is to get
// every row onto durable storage and prove it renders; local cleanup is a
// separate, explicit, later step (see the Phase 10 report).

const __dirname = dirname(fileURLToPath(import.meta.url))
const uploadsRoot = join(__dirname, '../../uploads')

const MIME_BY_EXT = { '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

async function migrateTable({ table, urlColumn, subdir, folder, extraSelect = '' }) {
  const { rows } = await pool.query(`SELECT id, ${urlColumn}${extraSelect} FROM ${table} ORDER BY id`)
  const results = []

  for (const row of rows) {
    const url = row[urlColumn]
    const marker = `/uploads/${subdir}/`
    if (!url || !url.includes(marker)) {
      results.push({ id: row.id, status: 'skipped', reason: 'not a local upload URL' })
      continue
    }

    const filename = url.split(marker)[1]
    const localPath = join(uploadsRoot, subdir, filename)

    try {
      const buffer = await readFile(localPath)
      const ext = extname(filename).toLowerCase()
      const fakeFile = { buffer, originalname: filename, mimetype: MIME_BY_EXT[ext] || 'image/jpeg' }

      const uploaded = await uploadImageFileDetailed(fakeFile, folder)

      await pool.query(`UPDATE ${table} SET ${urlColumn} = $1, cloudinary_public_id = $2 WHERE id = $3`, [
        uploaded.url,
        uploaded.publicId,
        row.id,
      ])

      results.push({ id: row.id, status: 'migrated', from: url, to: uploaded.url, publicId: uploaded.publicId, localPath })
    } catch (err) {
      results.push({ id: row.id, status: 'FAILED', from: url, localPath, error: err.message })
    }
  }

  return results
}

async function main() {
  console.log('=== Migrating ground_photos ===')
  const groundPhotos = await migrateTable({
    table: 'ground_photos',
    urlColumn: 'image_url',
    subdir: 'ground-photos',
    folder: 'LOC/ground-photos',
  })
  console.log(JSON.stringify(groundPhotos, null, 2))

  console.log('\n=== Migrating amenities ===')
  const amenities = await migrateTable({
    table: 'amenities',
    urlColumn: 'image_url',
    subdir: 'amenities',
    folder: 'LOC/amenities',
  })
  console.log(JSON.stringify(amenities, null, 2))

  console.log('\n=== Migrating partners ===')
  const partners = await migrateTable({
    table: 'partners',
    urlColumn: 'logo_url',
    subdir: 'partners',
    folder: 'LOC/partners',
  })
  console.log(JSON.stringify(partners, null, 2))

  const all = [...groundPhotos, ...amenities, ...partners]
  const migrated = all.filter((r) => r.status === 'migrated').length
  const failed = all.filter((r) => r.status === 'FAILED')
  const skipped = all.filter((r) => r.status === 'skipped').length

  console.log(`\n=== SUMMARY: ${migrated} migrated, ${skipped} skipped, ${failed.length} FAILED ===`)
  if (failed.length > 0) {
    console.log('FAILED rows (local files left untouched, DB left unchanged for these):')
    console.log(JSON.stringify(failed, null, 2))
    process.exitCode = 1
  }

  await pool.end()
}

main().catch((err) => {
  console.error('Migration script crashed:', err)
  process.exit(1)
})
