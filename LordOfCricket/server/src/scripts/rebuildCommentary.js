// Phase 12 (Part 77/78/79) — backfills/repairs the commentary projection for
// every innings in the database. Idempotent: rebuildInningsCommentary()
// deletes and regenerates a single innings' rows inside one transaction, so
// running this twice never duplicates anything. Read-only against cricket
// truth (deliveries/match_events/innings/matches) — only ever writes
// commentary_entries. Safe to run against matches that existed before Phase
// 12 (no commentary yet) or to repair a suspected drift after a manual DB fix.
//
//   npm run commentary:rebuild --prefix server
import 'dotenv/config'
import { pool } from '../config/db.js'
import { rebuildInningsCommentary } from '../services/commentary.service.js'

async function main() {
  const { rows } = await pool.query('SELECT id FROM innings ORDER BY id')
  let totalEntries = 0
  for (const row of rows) {
    const result = await rebuildInningsCommentary(row.id)
    const count = result ? result.entries.length : 0
    totalEntries += count
    console.log(`  innings ${row.id}: ${count} commentary entries`)
  }
  console.log(`✅ Commentary rebuilt for ${rows.length} innings (${totalEntries} entries total)`)
  await pool.end()
}

main().catch((err) => {
  console.error('❌ Commentary rebuild failed:', err.message)
  process.exit(1)
})
