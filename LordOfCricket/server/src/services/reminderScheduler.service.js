// Match reminders (Phase 23, Workstream D). No scheduled/delayed job
// infrastructure exists anywhere in this codebase (no cron lib, no queue
// lib — confirmed by audit) and three fixed reminder windows don't justify
// introducing one. server.js runs a single, persistent long-lived process
// (not serverless), so an in-process setInterval poller is architecturally
// safe here. Dedup is a DB guarantee, not just an application check: the
// partial unique index on ground_notifications(user_id, type,
// related_match_id) (schema.sql, Phase 23) means a duplicate reminder can
// never land even if two ticks overlap — this poller's INSERT simply fails
// with 23505 and is skipped, the same pattern applyForSlot already uses for
// its own concurrency backstop.
import { pool } from '../config/db.js'
import { logger } from '../utils/logger.js'
import { groundLocalNaiveTimestamp } from '../domain/shared/groundTime.js'

const POLL_INTERVAL_MS = 5 * 60 * 1000
// Matches the poll cadence — under normal operation a match falls into
// exactly one tick's [windowMinutes - TOLERANCE, windowMinutes] band per
// reminder type. A missed tick (server restart, slow query) just means the
// next tick's wider net still catches it, and the unique index guarantees
// no double-send either way.
const TOLERANCE_MINUTES = 5

const WINDOWS = [
  { minutes: 24 * 60, type: 'UMPIRE_REMINDER_24H', label: 'tomorrow' },
  { minutes: 2 * 60, type: 'UMPIRE_REMINDER_2H', label: 'in 2 hours' },
  { minutes: 30, type: 'UMPIRE_REMINDER_30M', label: 'in 30 minutes' },
]

// `matches.match_date` is a bare TIMESTAMP (no timezone) column whose
// stored digits are always ground-local (IST) wall-clock digits — exactly
// what a Ground Owner typed into a datetime-local input, written verbatim
// with no conversion. Postgres's cast of a string to `timestamp` keeps the
// literal digits and drops any offset suffix, so comparing it against a
// `.toISOString()` ('Z'-suffixed, UTC-digit) bound does NOT cancel out as
// an earlier version of this comment claimed: it silently compares
// IST-clock digits against UTC-clock digits, a constant 5:30 mismatch.
// Confirmed empirically (Umpire Communication & Commercial 2.0 audit) — the
// 24h reminder was actually firing ~18.5h before kickoff, and the 2h/30m
// reminders never fired at all for a normally-created match. The fix:
// render the bounds as ground-local digit strings too (groundTime.js),
// via the one shared time utility, so both sides of the comparison are
// genuinely the same clock.
async function findDueAssignments(windowMinutes) {
  const now = Date.now()
  const lo = groundLocalNaiveTimestamp(new Date(now + (windowMinutes - TOLERANCE_MINUTES) * 60000))
  const hi = groundLocalNaiveTimestamp(new Date(now + windowMinutes * 60000))
  const { rows } = await pool.query(
    `SELECT s.umpire_user_id, s.match_id, ta.name AS team_a_name, tb.name AS team_b_name
     FROM match_umpire_slots s
     JOIN matches m ON m.id = s.match_id
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE s.status = 'ASSIGNED' AND m.status = 'upcoming'
       AND m.match_date BETWEEN $1 AND $2`,
    [lo, hi],
  )
  return rows
}

async function sendReminder(assignment, { type, label }) {
  try {
    await pool.query(
      `INSERT INTO ground_notifications (user_id, type, title, body, related_match_id) VALUES ($1, $2, $3, $4, $5)`,
      [
        assignment.umpire_user_id,
        type,
        'Umpiring assignment reminder',
        `Your umpiring assignment (${assignment.team_a_name} vs ${assignment.team_b_name}) is ${label}.`,
        assignment.match_id,
      ],
    )
  } catch (err) {
    if (err.code === '23505') return // already sent for this (user, type, match) — the unique index is the real guarantee, this is expected, not an error
    // Best-effort — a notification failure must never crash the poller or
    // affect any underlying operation (same posture groundNotification.
    // service.js's own createNotification already guarantees for every
    // other notification path in this codebase).
    logger.error('Failed to send umpire reminder notification', { error: err.message, matchId: assignment.match_id, type })
  }
}

export async function runReminderTick() {
  for (const window of WINDOWS) {
    try {
      const due = await findDueAssignments(window.minutes)
      for (const assignment of due) {
        await sendReminder(assignment, window)
      }
    } catch (err) {
      logger.error('Reminder poller tick failed for a window', { error: err.message, windowMinutes: window.minutes })
    }
  }
}

let intervalHandle = null

export function startReminderScheduler() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => {
    runReminderTick().catch((err) => logger.error('Reminder poller tick failed', { error: err.message }))
  }, POLL_INTERVAL_MS)
  // Never keeps the process alive on its own (relevant for tests/graceful shutdown).
  intervalHandle.unref?.()
}

export function stopReminderScheduler() {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
