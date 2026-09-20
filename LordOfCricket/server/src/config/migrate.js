import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { pool } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
  await pool.query(sql)
  console.log('✅ Schema applied')
  await pool.end()
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
