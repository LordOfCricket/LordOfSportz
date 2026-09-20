import { google } from 'googleapis'
import { GROUND_TIMEZONE } from '../domain/booking/policy.js'
import { logger } from '../utils/logger.js'

// Phase 14 Part 3 (28-32, 56-57) — a server-owned OPERATIONAL calendar (the
// ground's own calendar), authenticated via a Google service account — never
// a customer's personal OAuth. This mirrors the existing "MongoDB is
// optional, degrade gracefully" pattern from config/db.js exactly:
// `isCalendarConfigured()` gates every call site, nothing here ever throws
// out to a caller, and a booking's success/failure is 100% independent of
// this module. LOC's PostgreSQL `ground_bookings` row is authoritative —
// this module only ever runs AFTER that row is already committed.
//
// Credentials (server-side only, never sent to the browser):
//   GOOGLE_CALENDAR_ID               the ground's operational calendar id
//   GOOGLE_SERVICE_ACCOUNT_EMAIL     service account client email
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  service account private key (PEM).
//     `\n` sequences are unescaped — a raw PEM cannot survive a single-line
//     .env value otherwise (the same reason JWT_SECRET-style single-value
//     env vars can't hold this key directly).

let calendarClient = null

function buildClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (!email || !rawKey) return null
  const privateKey = rawKey.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ['https://www.googleapis.com/auth/calendar'] })
  return google.calendar({ version: 'v3', auth })
}

export function isCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
}

function getClient() {
  if (!isCalendarConfigured()) return null
  if (!calendarClient) calendarClient = buildClient()
  return calendarClient
}

/**
 * Creates a calendar event for a CONFIRMED booking. Never throws — a Google
 * outage/misconfiguration must never make a valid LOC reservation fail or
 * roll back (Part 31). Returns `{ ok, eventId, error }`; the caller
 * (groundBooking.service.js) persists `google_sync_status` from this result.
 * Idempotency is the CALLER's responsibility (only call this once per
 * booking — check `google_calendar_event_id` is still null first); this
 * function itself does not deduplicate.
 */
export async function createCalendarEvent({ publicBookingId, customerName, startTime, endTime, purpose }) {
  const client = getClient()
  if (!client) return { ok: false, error: 'NOT_CONFIGURED' }

  try {
    const res = await client.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: `Ground Booking — ${customerName}`,
        description: purpose ? `Purpose: ${purpose}\nLOC Booking Ref: ${publicBookingId}` : `LOC Booking Ref: ${publicBookingId}`,
        start: { dateTime: startTime.toISOString(), timeZone: GROUND_TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: GROUND_TIMEZONE },
        extendedProperties: { private: { locBookingRef: publicBookingId } },
      },
    })
    return { ok: true, eventId: res.data.id }
  } catch (err) {
    logger.error('Google Calendar event creation failed', { publicBookingId, error: err.message })
    return { ok: false, error: err.message }
  }
}

export async function cancelCalendarEvent(eventId) {
  const client = getClient()
  if (!client) return { ok: false, error: 'NOT_CONFIGURED' }
  if (!eventId) return { ok: true } // nothing was ever synced — nothing to cancel

  try {
    await client.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId })
    return { ok: true }
  } catch (err) {
    // A 410/404 means it's already gone — treat as success, not a failure to retry forever.
    if (err.code === 410 || err.code === 404) return { ok: true }
    logger.error('Google Calendar event cancellation failed', { eventId, error: err.message })
    return { ok: false, error: err.message }
  }
}
