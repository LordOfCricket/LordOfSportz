// Phase 8 — real, working PostgreSQL backup, filling the gap `docs/
// DEPLOYMENT.md` previously only described in prose ("run pg_dump on a
// cron") with no actual script. Deliberately NOT a pg_dump wrapper: managed
// Postgres providers frequently don't grant shell access to run pg_dump at
// all, but always grant a normal connection — this only needs `pg`, the
// dependency the app already has. Logical (row-data) backup only; schema
// reconstruction on restore uses schema.sql (already the authoritative,
// idempotent, replayable schema source — see docs/DATABASE.md), the same
// division of responsibility `npm run db:migrate` already relies on.
//
// Output: one timestamped JSON file, `{ tables: { <name>: [...rows] },
// meta: { takenAt, tableCount, rowCounts } }`. Table discovery is dynamic
// (information_schema), not a hand-maintained list — a new table is
// captured automatically, never silently skipped.
import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { pool } from '../config/db.js'

export async function backupPostgres({ outDir = process.cwd() } = {}) {
  const { rows: tableRows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  )
  const tableNames = tableRows.map((r) => r.table_name)

  const tables = {}
  const rowCounts = {}
  for (const name of tableNames) {
    // Table names come from information_schema, never user input — safe to
    // interpolate (no parameterized-identifier support in `pg`).
    const { rows } = await pool.query(`SELECT * FROM "${name}"`)
    tables[name] = rows
    rowCounts[name] = rows.length
  }

  const takenAt = new Date().toISOString()
  const payload = { meta: { takenAt, tableCount: tableNames.length, rowCounts }, tables }

  const filename = `loc-postgres-backup-${takenAt.replace(/[:.]/g, '-')}.json`
  const outPath = join(outDir, filename)
  writeFileSync(outPath, JSON.stringify(payload))

  return { outPath, tableCount: tableNames.length, rowCounts, totalRows: Object.values(rowCounts).reduce((a, b) => a + b, 0) }
}

async function main() {
  const result = await backupPostgres({ outDir: process.argv[2] || process.cwd() })
  console.log(`✅ Backup written to ${result.outPath}`)
  console.log(`   ${result.tableCount} tables, ${result.totalRows} rows total`)
  await pool.end()
}

import { fileURLToPath } from 'url'
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMainModule) {
  main().catch((err) => {
    console.error('❌ Backup failed:', err.message)
    process.exitCode = 1
  })
}
