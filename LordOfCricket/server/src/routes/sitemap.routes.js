import { Router } from 'express'
import { findAllActiveGrounds } from '../models/ground.model.js'
import { allowedOrigins } from '../config/corsOrigins.js'

// Phase 12 — dynamic sitemap.xml, reflecting real ACTIVE grounds (the same
// findAllActiveGrounds query the public "/grounds" browse listing already
// uses — see ground.controller.js#listAllGrounds). No new schema: grounds
// already carry everything a sitemap entry needs. Mounted at the app's
// top level (server.js), NOT under /api, since it's not an API response and
// must never carry the blanket `Cache-Control: no-store` every /api route
// gets — a sitemap is exactly the kind of response that SHOULD be cached
// by crawlers/CDNs.
//
// CLIENT_ORIGIN (already configured for CORS — see corsOrigins.js) is reused
// as the canonical public site origin: a sitemap must list the FRONTEND's
// page URLs (what a visitor/crawler actually opens), not this API's own
// origin. CLIENT_ORIGIN's own configured order is dev-first (see .env.example:
// "http://localhost:5173,https://lordofcricket.com,https://www.lordofcricket.com"),
// so picking allowedOrigins[0] blindly would ship a sitemap full of
// localhost URLs in production — the first https:// origin is preferred
// instead, falling back to whatever's configured (even localhost) only if
// nothing else qualifies, so this never throws in a pure local-dev setup.
const router = Router()

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])
}

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const siteOrigin = allowedOrigins.find((o) => o.startsWith('https://')) || allowedOrigins[0]
    if (!siteOrigin) {
      // No CLIENT_ORIGIN configured (e.g. local dev without it set) — a
      // sitemap with no real base URL to point at is worse than none;
      // fail loudly rather than emit URLs no crawler could ever resolve.
      return res.status(503).type('text/plain').send('Sitemap unavailable: CLIENT_ORIGIN is not configured.')
    }

    const { rows: grounds } = await findAllActiveGrounds({ limit: 5000, offset: 0, sort: 'name' })

    const staticUrls = [
      { loc: `${siteOrigin}/`, changefreq: 'weekly', priority: '1.0' },
      { loc: `${siteOrigin}/grounds`, changefreq: 'daily', priority: '0.9' },
    ]
    const groundUrls = grounds.map((g) => ({
      loc: `${siteOrigin}/grounds/${g.public_ground_id}`,
      lastmod: g.created_at ? new Date(g.created_at).toISOString().split('T')[0] : undefined,
      changefreq: 'weekly',
      priority: '0.8',
    }))

    const urlEntries = [...staticUrls, ...groundUrls]
      .map((u) => {
        const parts = [`<loc>${escapeXml(u.loc)}</loc>`]
        if (u.lastmod) parts.push(`<lastmod>${u.lastmod}</lastmod>`)
        if (u.changefreq) parts.push(`<changefreq>${u.changefreq}</changefreq>`)
        if (u.priority) parts.push(`<priority>${u.priority}</priority>`)
        return `  <url>${parts.map((p) => `\n    ${p}`).join('')}\n  </url>`
      })
      .join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`

    res.set('Content-Type', 'application/xml')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    next(err)
  }
})

export default router
