// Phase 8 — the counterpart to backupPostgres.js, and the actual mechanism
// behind the Phase 8 restore test (see the Phase 8 report). Restores into a
// caller-supplied Postgres SCHEMA (via search_path), never directly into
// `public` — the caller decides whether that schema is a disposable
// verification target or a real empty database's `public` schema during a
// genuine disaster-recovery restore. This script never drops or truncates
// anything; it only creates.
//
// Insert order: rather than hand-computing a topological sort of ~60
// tables' foreign keys (fragile to keep in sync as the schema grows), this
// makes repeated passes over the table list, inserting whatever rows don't
// yet violate a foreign key, deferring the rest, until a full pass makes no
// further progress. Postgres's own constraint enforcement is the ordering
// oracle — more robust than a hand-maintained dependency list.
import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool } from '../config/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function restorePostgres(backupPath, { schema, dropIfExists = false } = {}) {
  if (!schema) throw new Error('restorePostgres requires an explicit target schema — never defaults to public.')
  const backup = JSON.parse(readFileSync(backupPath, 'utf-8'))

  const client = await pool.connect()
  try {
    if (dropIfExists) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)

    const schemaSql = readFileSync(join(__dirname, '../config/schema.sql'), 'utf-8')
    await client.query(schemaSql)

    // _prisma_migrations is Prisma's own internal bookkeeping table, created
    // by `prisma migrate`, never by schema.sql — there is nothing for this
    // schema-replay-based restore to recreate it into. Not a data-loss
    // concern: it tracks migration application history, not application
    // data, and Prisma isn't on any live request path yet (docs/DATABASE.md).
    const tableNames = Object.keys(backup.tables).filter((name) => name !== '_prisma_migrations')
    let remaining = tableNames.map((name) => ({ name, rows: backup.tables[name] }))
    const inserted = {}
    let guard = tableNames.length + 1 // worst case: one table succeeds per pass

    while (remaining.length > 0 && guard-- > 0) {
      const stillRemaining = []
      for (const { name, rows } of remaining) {
        if (rows.length === 0) {
          inserted[name] = 0
          continue
        }
        try {
          await client.query('BEGIN')
          const columns = Object.keys(rows[0])
          const columnList = columns.map((c) => `"${c}"`).join(', ')
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
          // ON CONFLICT DO NOTHING — schema.sql itself seeds fixed reference
          // rows for some tables (e.g. staff_roles, permissions) as part of
          // building the schema; those already exist by the time we get
          // here, and re-inserting the backed-up copies of the SAME rows
          // must be a no-op, not a primary-key violation.
          const insertSql = `INSERT INTO "${name}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`
          for (const row of rows) {
            // JSON/JSONB columns round-trip through the backup file as plain
            // JS objects/arrays (JSON.parse of already-JSON data) — passed
            // to `pg` as a bound parameter, a plain object/array is encoded
            // as a Postgres ARRAY/ROW literal by default, not JSON, so it
            // must be re-stringified explicitly before binding.
            const values = columns.map((c) => {
              const v = row[c]
              if (v !== null && typeof v === 'object') return JSON.stringify(v)
              return v
            })
            await client.query(insertSql, values)
          }
          await client.query('COMMIT')
          inserted[name] = rows.length
        } catch (err) {
          await client.query('ROLLBACK')
          stillRemaining.push({ name, rows, lastError: err.message })
        }
      }
      if (stillRemaining.length === remaining.length) {
        // No progress this pass — every remaining table's failure is a real
        // problem (missing dependency never in this backup, or a
        // genuinely-unsatisfiable constraint), not an ordering issue.
        throw new Error(
          `Restore stalled — could not insert: ${stillRemaining.map((t) => `${t.name} (${t.lastError})`).join('; ')}`,
        )
      }
      remaining = stillRemaining
    }

    return { schema, inserted }
  } finally {
    await client.query('SET search_path TO public') // never leave this connection pointed at a disposable schema before it returns to the pool
    client.release()
  }
}

async function main() {
  const [backupPath, schema] = process.argv.slice(2)
  if (!backupPath || !schema) {
    console.error('Usage: node src/scripts/restorePostgres.js <backup.json> <targetSchema>')
    process.exitCode = 1
    return
  }
  const result = await restorePostgres(backupPath, { schema })
  console.log(`✅ Restored into schema "${result.schema}"`)
  console.log(JSON.stringify(result.inserted, null, 2))
  await pool.end()
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMainModule) {
  main().catch((err) => {
    console.error('❌ Restore failed:', err.message)
    process.exitCode = 1
  })
}
