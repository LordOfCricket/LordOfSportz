import 'dotenv/config'
import http from 'http'
import { Server } from 'socket.io'
import app from './app.js'
import { connectPostgres, pool } from './config/db.js'
import { connectPrisma, disconnectPrisma } from './config/prisma.js'
import { allowedOrigins } from './config/corsOrigins.js'
import { registerCricketRealtime } from './realtime/cricketRealtime.js'
import { registerBookingRealtime } from './realtime/bookingRealtime.js'
import { registerMatchChatRealtime } from './realtime/matchChatRealtime.js'
import { registerCanteenRealtime } from './realtime/canteenRealtime.js'
import { validateEnv } from './config/validateEnv.js'
import { startReminderScheduler, stopReminderScheduler } from './services/reminderScheduler.service.js'
import { logger } from './utils/logger.js'

// ES module imports (including app.js's own chain, which is where
// utils/jwt.js's JWT_SECRET check lives) are always fully evaluated before
// any of this file's own inline code runs — so this can only run after
// that check, not before it. That's fine: both checks fail fast with a
// clear message either way, this one just covers the variables nothing
// upstream was already checking (PG_*, CLIENT_ORIGIN).
validateEnv()

// A bug that escapes every try/catch and domain-error path (a genuine
// programming error, not a normal request failure — those already go
// through middlewares/errorHandler.js) should never fail silently. Log it
// with full detail server-side, then exit — process managers (pm2/systemd/
// Docker restart policy) are responsible for bringing the process back up
// into a known-good state, which is safer than continuing with whatever
// left the process in this state.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { error: err.message, stack: err.stack })
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined })
})

const PORT = process.env.PORT || 5000

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH'],
    // Phase 8 — required for matchChatRealtime.js's cookie-based socket
    // auth: without this, a credentialed (`withCredentials: true`) socket
    // handshake from an allowed origin is rejected by the CORS layer before
    // the cookie ever reaches `socket.handshake.headers.cookie`. Mirrors
    // app.js's own HTTP `cors({ credentials: true })` setting.
    credentials: true,
  },
})

// Make io available to every request as req.io (see app.js middleware)
app.locals.io = io

// Canteen realtime (staff/user/order rooms) — see
// realtime/canteenRealtime.js for the security-fix rationale (previously
// zero auth on these three handlers) and the extraction rationale (moved
// out of this file so it's testable the same way as the three registrations
// below it).
registerCanteenRealtime(io)

// Phase 11 — cricket realtime (spectator match rooms). A second, additive
// connection listener on the SAME io/http server — canteen's handlers above
// are untouched. See server/src/realtime/cricketRealtime.js.
registerCricketRealtime(io)

// Phase 14 Part 3 — ground booking availability refresh rooms. Same additive
// pattern as cricket realtime above. See server/src/realtime/bookingRealtime.js.
registerBookingRealtime(io)

// Umpire Communication & Commercial 2.0 — match-scoped chat. Same additive
// pattern; its own authorized room, separate from the public spectator
// match:{id} room above. See server/src/realtime/matchChatRealtime.js.
registerMatchChatRealtime(io)

// MongoDB cleanup, Phase 6 — GalleryImage/AiInsight/MenuItem/TodayMenu/Order
// are all PostgreSQL now (Phases 1-5); no live route/controller/service
// imports a Mongo model anymore (repo-wide search, see the Phase 6 report).
// `connectMongo()` is deliberately NOT called here — MongoDB is no longer
// part of the production runtime startup path. It remains fully defined and
// exported from config/db.js (unchanged) for migration scripts
// (scripts/migrate*ToPostgres.js, scripts/exportMongoBackup.js) and
// integration tests to call themselves, independently, when they run.
async function start() {
  await connectPostgres()
  // Phase 2A — Prisma foundation. Not yet on any live request path (raw `pg`
  // via config/db.js remains authoritative this phase), so a Prisma-specific
  // connectivity problem is logged, not fatal — connectPostgres() above is
  // still the one hard boot dependency.
  try {
    await connectPrisma()
  } catch (err) {
    logger.warn('Prisma connectivity check failed at boot (continuing — not yet on the live request path)', { error: err.message })
  }
  server.listen(PORT, () => logger.info(`Server listening on port ${PORT}`))
  // Phase 23, Workstream D — umpire match reminders. Only started here (the
  // real server boot path), never by integration tests, which start their
  // own throwaway http.createServer(app) instances via startTestApp() and
  // would otherwise leave a dangling interval per test file.
  startReminderScheduler()
}

start()

// Phase 8 — Kubernetes sends SIGTERM on pod termination (rolling update,
// scale-down, node drain) and waits out `terminationGracePeriodSeconds`
// (default 30s) before SIGKILL. Previously nothing handled it at all, so
// the process died mid-request on every rollout. Order matters: stop taking
// NEW work first (reminder poller, then refuse new HTTP/socket connections
// via server.close()), only THEN close the connections those in-flight
// requests still need (Postgres pool, Prisma) — closing the DB first would
// fail every request that was still draining.
let shuttingDown = false
async function gracefulShutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} received — starting graceful shutdown`)

  stopReminderScheduler()

  // Force-exit safety net: an open keep-alive HTTP connection or a socket
  // that never disconnects would otherwise hang server.close()'s callback
  // forever, past Kubernetes' own grace period anyway — better to exit
  // loudly on our own timeline than be SIGKILLed mid-cleanup.
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit')
    process.exit(1)
  }, 10000)
  forceExitTimer.unref()

  // Closes every open Socket.IO connection (match chat, cricket/booking
  // realtime, canteen rooms) before the HTTP server itself stops — a
  // socket left open would otherwise keep server.close() waiting.
  io.close()

  server.close(async (err) => {
    if (err) logger.error('Error while closing HTTP server', { error: err.message })
    try {
      await pool.end()
    } catch (poolErr) {
      logger.error('Error while closing Postgres pool', { error: poolErr.message })
    }
    try {
      await disconnectPrisma()
    } catch (prismaErr) {
      logger.error('Error while disconnecting Prisma', { error: prismaErr.message })
    }
    clearTimeout(forceExitTimer)
    logger.info('Graceful shutdown complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
