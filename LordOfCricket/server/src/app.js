import fs from 'fs'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import routes from './routes/index.js'
import sitemapRoutes from './routes/sitemap.routes.js'
import { notFound, errorHandler } from './middlewares/errorHandler.js'
import { requestId } from './middlewares/requestId.js'
import { allowedOrigins } from './config/corsOrigins.js'

// Phase 3 — same fail-fast pattern as utils/jwt.js's JWT_SECRET check: a
// production deployment that forgets to set SESSION_COOKIE_SECRET must
// never silently sign session cookies with a well-known fallback value.
if (!process.env.SESSION_COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_COOKIE_SECRET must be set in production — refusing to start with the insecure development fallback secret.')
}
const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || 'dev-only-insecure-cookie-secret-change-me'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// Only trust the reverse proxy's X-Forwarded-For when explicitly told to
// (production deployments sit behind one — Nginx/Render/etc). Left off by
// default so req.ip can't be spoofed via that header in an environment with
// no real proxy in front, which would otherwise let a client bypass rate
// limiting by claiming any IP it likes.
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1)
}

const canteenUploadsDir = join(__dirname, '../uploads/canteen')
if (!fs.existsSync(canteenUploadsDir)) {
  fs.mkdirSync(canteenUploadsDir, { recursive: true })
}

// Phase 21.2 — request-id correlation, first in the chain so every other
// middleware (including error handling) and every log line for this request
// can see req.id, no matter how early something else fails.
app.use(requestId)

// Standard security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
// etc). crossOriginResourcePolicy is relaxed to allow the client (a
// different origin) to load uploaded images/canteen photos served from
// /uploads below.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
// gzip/brotli-capable response compression — JSON payloads (leaderboards,
// search results, analytics) were previously sent uncompressed. Default 1KB
// threshold — small responses (most of this API) skip compression entirely,
// since compressing a tiny payload only adds CPU cost for no size benefit.
app.use(compression())
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser(SESSION_COOKIE_SECRET))
app.use('/uploads', express.static(join(__dirname, '../uploads')))
app.use('/uploads/canteen', express.static(canteenUploadsDir))

// Attach the shared Socket.io instance (set in server.js) to every request,
// so canteen controllers can keep using `req.io.emit(...)` unchanged.
app.use((req, res, next) => {
  req.io = req.app.locals.io
  next()
})

// Phase 12 — sitemap.xml, mounted before the /api no-store rule below (a
// crawler-facing static-ish resource, not an API response — it should be
// cacheable, unlike everything under /api).
app.use(sitemapRoutes)

// Every /api response is dynamic, and several routes return per-user data
// (bookings, notifications, profile) — nothing under /api should ever be
// stored by a browser or intermediary cache. Static assets under /uploads
// (served above) are deliberately left to their own default caching, since
// images genuinely benefit from it.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// Main API — LOC homepage/ground endpoints plus canteen, mounted under /api
app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

export default app
