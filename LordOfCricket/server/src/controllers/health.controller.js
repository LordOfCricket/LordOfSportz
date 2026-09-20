import { pool } from '../config/db.js'
import { isCalendarConfigured } from '../services/googleCalendar.service.js'
import { isAIConfigured } from '../ai/aiProvider.js'

// Liveness — "is the process up at all". Deliberately checks nothing
// external (no DB query) so an orchestrator's liveness probe can't be made
// to restart a perfectly healthy process just because a downstream
// dependency is slow/down — that's what /health/ready is for.
export function getHealth(req, res) {
  res.json({ status: 'ok' })
}

// Readiness — "is this instance able to actually serve real requests".
// PostgreSQL is the ONLY dependency, hard or optional, this endpoint knows
// about — it is both necessary and sufficient for every live feature as of
// MongoDB cleanup Phase 6 (GalleryImage/AiInsight/MenuItem/TodayMenu/Order
// all migrated off MongoDB in Phases 1-5). MongoDB was removed from this
// response entirely, not just relabeled: server.js no longer calls
// connectMongo() at boot, so reporting a live "connected"/"disconnected"
// status here would always read "disconnected" and could be misread as an
// outage rather than the deliberate, permanent architecture it now is.
// Google Calendar/AI remain genuinely optional runtime integrations and are
// still reported as informational state, never a reason to fail readiness.
export async function getReadiness(req, res) {
  let postgres = 'error'
  try {
    await pool.query('SELECT 1')
    postgres = 'connected'
  } catch {
    // swallow — reflected in the response body below, not thrown further
  }

  const body = {
    status: postgres === 'connected' ? 'ready' : 'not_ready',
    postgres,
    optional: {
      googleCalendar: isCalendarConfigured() ? 'configured' : 'not_configured',
      ai: isAIConfigured() ? 'configured' : 'not_configured',
    },
  }
  res.status(postgres === 'connected' ? 200 : 503).json(body)
}
