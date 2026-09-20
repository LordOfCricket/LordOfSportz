import pg from 'pg'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { logger } from '../utils/logger.js'

dotenv.config()

const { Pool, types } = pg

// pg's default DATE (OID 1082) parser returns a JS Date built from local
// server time, which JSON serialization (res.json -> toISOString) then
// re-renders in UTC — a date stored as exactly '1998-04-12' can round-trip
// back to the API response as '1998-04-11' whenever the server's local
// offset is ahead of UTC. players.date_of_birth (First-Login Player Profile
// Onboarding) is the first bare DATE column in this schema — returning the
// raw 'YYYY-MM-DD' string instead avoids the round-trip entirely and is
// exactly what every caller (controller validation, the frontend's <input
// type="date">) already expects. Safe globally: no other column uses OID
// 1082 today.
types.setTypeParser(1082, (value) => value)

export const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  // Tunable without a code change (pg's own default is 10 — same value,
  // just made explicit and configurable). connectionTimeoutMillis bounds
  // how long a query can hang waiting for a pool client if Postgres is
  // unreachable — pg's own default there is 0 (no timeout, i.e. hang
  // forever), which is the wrong default for a production health check or
  // request path.
  max: Number(process.env.PG_POOL_MAX) || 10,
  connectionTimeoutMillis: 10000,
})

// node-postgres emits 'error' on the pool when an already-connected, idle
// client is dropped by the backend (network blip, DB restart, etc). Without
// a listener here, that becomes an uncaught exception that kills the whole
// process — a single flaky connection should never take the API down.
pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error (idle client)', { error: err.message })
})

export async function connectPostgres() {
  try {
    const res = await pool.query('SELECT NOW()')
    logger.info('Postgres connected', { serverTime: res.rows[0].now })
  } catch (err) {
    logger.error('Postgres connection failed — exiting', { error: err.message })
    process.exit(1)
  }
}

// MongoDB cleanup, Phase 6 — MongoDB is no longer part of the production
// runtime startup path (server.js's start() no longer calls this). Every
// live business feature (GalleryImage/AiInsight/MenuItem/TodayMenu/Order)
// is PostgreSQL-backed as of Phases 1-5. These two functions are kept,
// unchanged, ONLY for migration/rollback tooling
// (scripts/migrate*ToPostgres.js, scripts/exportMongoBackup.js) and
// integration tests that verify migration idempotency against disposable
// Mongo fixtures — each of those callers invokes connectMongo() itself,
// independently of server.js.
export async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    logger.info('MongoDB connected')
  } catch (err) {
    logger.warn('MongoDB connection failed (continuing without it)', { error: err.message })
  }
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1
}