import { pool } from '../config/db.js'

export async function insertBooking(client, {
  groundId, publicBookingId, bookingType = 'CUSTOMER', userId = null, customerName, contactPhone = null, contactEmail = null,
  startTime, endTime, purpose = null, expectedPlayers = null, notes = null, clientActionId = null, createdByStaffId = null,
  googleSyncStatus = 'PENDING', blockType = null, bookingPurpose = 'WALK_IN', matchFormat = null, status = 'CONFIRMED',
  holdExpiresAt = null, proposalId = null, amount = null, pricingSlotId = null,
}) {
  const { rows } = await client.query(
    `INSERT INTO ground_bookings (
       ground_id, public_booking_id, booking_type, user_id, customer_name, contact_phone, contact_email,
       start_time, end_time, purpose, expected_players, notes, client_action_id, created_by_staff_id, google_sync_status, block_type,
       booking_purpose, match_format, status, hold_expires_at, proposal_id, amount, pricing_slot_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [groundId, publicBookingId, bookingType, userId, customerName, contactPhone, contactEmail, startTime, endTime, purpose, expectedPlayers, notes, clientActionId, createdByStaffId, googleSyncStatus, blockType, bookingPurpose, matchFormat, status, holdExpiresAt, proposalId, amount, pricingSlotId]
  )
  return rows[0]
}

export async function findByClientActionId(clientActionId, client = pool) {
  if (!clientActionId) return null
  const { rows } = await client.query('SELECT * FROM ground_bookings WHERE client_action_id = $1', [clientActionId])
  return rows[0] || null
}

export async function findByPublicId(publicBookingId) {
  const { rows } = await pool.query('SELECT * FROM ground_bookings WHERE public_booking_id = $1', [publicBookingId])
  return rows[0] || null
}

export async function findById(id, client = pool) {
  const { rows } = await client.query('SELECT * FROM ground_bookings WHERE id = $1', [id])
  return rows[0] || null
}

/** Every CONFIRMED booking/block (customer + staff) whose range intersects
 * [fromUtc, toUtc) — the raw occupancy data the availability domain layer
 * turns into AVAILABLE/UNAVAILABLE slots. */
/** `groundId` is optional (Phase 24) so existing callers that predate
 * multi-ground bookings (groundTimeline/groundDashboard services) keep
 * their exact current behavior — unscoped — until they're deliberately
 * migrated to a specific ground. The walk-in flow (groundBooking.service.js)
 * always passes it, since that's what makes its availability computation
 * correct once bookings exist at more than one ground. */
export async function listConfirmedInRange(fromUtc, toUtc, groundId = null) {
  const { rows } = await pool.query(
    `SELECT id, public_booking_id, booking_type, block_type, start_time, end_time, purpose
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND start_time < $2 AND end_time > $1
       AND ($3::int IS NULL OR ground_id = $3)
     ORDER BY start_time`,
    [fromUtc, toUtc, groundId]
  )
  return rows
}

export async function listByUser(userId) {
  // Priority 4 — the customer's own booking history now carries the ground it
  // was made at. LEFT JOIN because ground_id is nullable on pre-multi-ground
  // rows (schema.sql Phase 24 ALTER) — those simply come back with null
  // ground_* and the serializer omits the `ground` field for them.
  const { rows } = await pool.query(
    `SELECT gb.*,
            g.public_ground_id AS ground_public_id,
            g.name AS ground_name,
            g.city AS ground_city
     FROM ground_bookings gb
     LEFT JOIN grounds g ON g.id = gb.ground_id
     WHERE gb.user_id = $1 AND gb.booking_type = 'CUSTOMER'
     ORDER BY gb.start_time DESC`,
    [userId]
  )
  return rows
}

// Phase 6 — list all bookings for a ground (ground owner view).
export async function listGroundBookingsInRange({ groundId, fromDate, toDate, status } = {}) {
  const conditions = ['ground_id = $1']
  const params = [groundId]

  if (fromDate) {
    params.push(fromDate)
    conditions.push(`DATE(start_time) >= $${params.length}`)
  }
  if (toDate) {
    params.push(toDate)
    conditions.push(`DATE(start_time) <= $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`status = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const { rows } = await pool.query(
    `SELECT * FROM ground_bookings WHERE ${where} ORDER BY start_time DESC`,
    params,
  )
  return rows
}

export async function listForStaffSchedule({ fromUtc, toUtc } = {}) {
  const conditions = []
  const params = []
  if (fromUtc) {
    params.push(fromUtc)
    conditions.push(`start_time >= $${params.length}`)
  }
  if (toUtc) {
    params.push(toUtc)
    conditions.push(`start_time < $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await pool.query(`SELECT * FROM ground_bookings ${where} ORDER BY start_time`, params)
  return rows
}

export async function cancelBooking(id, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'CONFIRMED' RETURNING *`,
    [id]
  )
  return rows[0] || null
}

/** Phase 24 — the general-purpose status transition for the widened state
 * machine (bookingConflict.service.js is the only caller; it always checks
 * domain/booking/bookingStatus.js#isValidStatusTransition first, and this
 * function's own `WHERE status = $2` (the expected fromStatus) is the
 * concurrency backstop against two requests racing to transition the same
 * row — the loser's UPDATE affects 0 rows and gets a null back, exactly
 * like insertBooking's EXCLUDE constraint is the backstop for creation. */
export async function updateBookingStatus(client, id, fromStatus, toStatus, extra = {}) {
  const fields = { status: toStatus, updated_at: new Date(), ...extra }
  const keys = Object.keys(fields)
  const setClause = keys.map((key, i) => `${key} = $${i + 3}`).join(', ')
  const { rows } = await client.query(
    `UPDATE ground_bookings SET ${setClause} WHERE id = $1 AND status = $2 RETURNING *`,
    [id, fromStatus, ...keys.map((key) => fields[key])]
  )
  return rows[0] || null
}

/** Phase 25 — links a just-created match_proposals row back to the booking
 * it reserves. Not a status transition (status stays PROPOSED throughout) —
 * a dedicated function rather than repurposing updateBookingStatus for a
 * same-to-same "transition", since proposal_id can only be set after
 * match_proposals.booking_id already points at this row (the booking must
 * exist first — see matchProposal.service.js#createMatchProposal). */
export async function linkProposal(client, bookingId, proposalId) {
  const { rows } = await client.query(
    `UPDATE ground_bookings SET proposal_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [bookingId, proposalId]
  )
  return rows[0] || null
}

/** Phase 24 — check-in is deliberately not a status transition (CONFIRMED
 * stays CONFIRMED, see bookingConflict.service.js's own comment), so it
 * doesn't go through updateBookingStatus's fromStatus-guard pattern; its
 * own WHERE clause (status = CONFIRMED AND checked_in_at IS NULL) is the
 * equivalent race guard — a second concurrent check-in attempt affects 0
 * rows and gets null back, same "loser gets a clean null" shape. */
export async function markCheckedIn(id, client = pool) {
  const { rows } = await client.query(
    `UPDATE ground_bookings SET checked_in_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'CONFIRMED' AND checked_in_at IS NULL RETURNING *`,
    [id]
  )
  return rows[0] || null
}

export async function updateGoogleSync(id, { eventId, status }) {
  const { rows } = await pool.query(
    `UPDATE ground_bookings SET google_calendar_event_id = COALESCE($2, google_calendar_event_id), google_sync_status = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, eventId ?? null, status]
  )
  return rows[0] || null
}

/** Distinct ground-local calendar dates (as 'YYYY-MM-DD') that have a
 * live/upcoming LOC match — Part 37: match_date is the only scheduling
 * column on `matches` (a plain TIMESTAMP with no timezone and no end time,
 * per docs/ARCHITECTURE.md), so this is a whole-day occupancy signal, never
 * a fabricated time range. `matches.match_date` is entered via a
 * `datetime-local` form field with no timezone conversion anywhere in the
 * app (confirmed by audit), so its stored naive value already IS the
 * ground-local wall-clock date/time as typed by whoever created the match —
 * taking its date component directly (no offset arithmetic) is the correct
 * reading of the existing data, not an assumption layered on top of it.
 * `fromUtc`/`toUtc` are still real UTC instants (the booking horizon window);
 * `fromDateStr`/`toDateStrExclusive` are plain 'YYYY-MM-DD' ground-local date
 * strings, compared directly against the naive column with no implicit
 * UTC/local conversion by the driver either way — the safest choice given
 * the column's already-ambiguous timezone semantics. */
// Phase 14 audit — optional groundId (default null = platform-wide,
// unchanged for the existing legacy-staff getUtilization caller), same
// NULL-safe pattern as every other ground-scoping fix in this file.
export async function listMatchDatesInRange(fromDateStr, toDateStrExclusive, groundId = null) {
  const { rows } = await pool.query(
    `SELECT DISTINCT to_char(match_date, 'YYYY-MM-DD') AS date_str
     FROM matches
     WHERE status IN ('upcoming', 'live') AND match_date::date >= $1::date AND match_date::date < $2::date
       AND ($3::int IS NULL OR ground_id = $3)`,
    [fromDateStr, toDateStrExclusive, groundId]
  )
  return rows.map((r) => r.date_str)
}

// ---------------------------------------------------------------------------
// Phase 18 — Ground Operations additions. Read-only extensions of the same
// existing tables (`ground_bookings`, `matches` + `tournament_fixtures`/
// `tournaments`) — no new occupancy source, no new concurrency mechanism.
// ---------------------------------------------------------------------------

/** Every CONFIRMED staff block (Feature 3/15) whose range intersects [fromUtc, toUtc). */
export async function listBlocksInRange(fromUtc, toUtc, groundId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM ground_bookings
     WHERE booking_type = 'STAFF_BLOCK' AND status = 'CONFIRMED' AND start_time < $2 AND end_time > $1
       AND ($3::int IS NULL OR ground_id = $3)
     ORDER BY start_time`,
    [fromUtc, toUtc, groundId]
  )
  return rows
}

/**
 * Every live/upcoming LOC match (friendly, practice, or tournament fixture —
 * Feature 13/14 treat them identically, same as the existing
 * `listMatchDatesInRange`) in the given ground-local date range, WITH team
 * names and (when tournament-linked) tournament/stage context, for the
 * timeline/dashboard to render a real label instead of a bare whole-day flag.
 * Still a whole-day occupancy signal (Part 37's documented reason: match_date
 * has no end time) — this only enriches the LABEL, never fabricates a
 * narrower time range.
 */
export async function listMatchEntriesInRange(fromDateStr, toDateStrExclusive, groundId = null) {
  const { rows } = await pool.query(
    `SELECT m.id, m.match_date, m.status, m.venue,
            ta.name AS team_a_name, tb.name AS team_b_name,
            f.stage, t.public_tournament_id AS tournament_public_id, t.name AS tournament_name
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     LEFT JOIN tournament_fixtures f ON f.match_id = m.id
     LEFT JOIN tournaments t ON t.id = f.tournament_id
     WHERE m.status IN ('upcoming', 'live') AND m.match_date::date >= $1::date AND m.match_date::date < $2::date
       AND ($3::int IS NULL OR m.ground_id = $3)
     ORDER BY m.match_date`,
    [fromDateStr, toDateStrExclusive, groundId]
  )
  return rows
}

/**
 * Booking History (Feature 10) — search/filter/sort/paginate over every
 * booking+block, staff-only. `q` matches customer name or purpose
 * (case-insensitive substring); `status`/`bookingType` are exact filters.
 * `COUNT(*) OVER()` gives the total for pagination in one round trip (same
 * pattern `team.repository.js#listPublicTeams` already uses).
 */
// Phase 11 audit — optional groundId (default null = platform-wide, the
// original Phase 18 legacy-staff-dashboard behavior via groundReport.service.js,
// left unchanged for that existing caller) added so ground-scoped callers
// (Ground Owner analytics) never have to fetch other grounds' bookings just
// to filter them out in JS afterward.
export async function searchBookings({ q = null, status = null, bookingType = null, fromUtc = null, toUtc = null, groundId = null, limit = 20, offset = 0 }) {
  const { rows } = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total_count
     FROM ground_bookings
     WHERE ($1::text IS NULL OR customer_name ILIKE '%' || $1 || '%' OR purpose ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR booking_type = $3)
       AND ($4::timestamptz IS NULL OR start_time >= $4)
       AND ($5::timestamptz IS NULL OR start_time < $5)
       AND ($8::int IS NULL OR ground_id = $8)
     ORDER BY start_time DESC
     LIMIT $6 OFFSET $7`,
    [q, status, bookingType, fromUtc, toUtc, limit, offset, groundId]
  )
  const total = rows.length ? rows[0].total_count : 0
  return { rows, total }
}

/** Bookings-by-date count (Feature 11 "Busy Days"), CUSTOMER bookings only, CONFIRMED, in ground-local calendar dates. */
export async function countBookingsByDate(fromUtc, toUtc, groundTimezone) {
  const { rows } = await pool.query(
    `SELECT to_char(start_time AT TIME ZONE $3, 'YYYY-MM-DD') AS date_str, COUNT(*)::int AS count
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND booking_type = 'CUSTOMER' AND start_time >= $1 AND start_time < $2
     GROUP BY 1
     ORDER BY count DESC, date_str ASC`,
    [fromUtc, toUtc, groundTimezone]
  )
  return rows
}

/** Bookings-by-hour-of-day count (Feature 11 "Peak Hours"), ground-local hour. */
export async function countBookingsByHour(fromUtc, toUtc, groundTimezone) {
  const { rows } = await pool.query(
    `SELECT EXTRACT(HOUR FROM start_time AT TIME ZONE $3)::int AS hour, COUNT(*)::int AS count
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND booking_type = 'CUSTOMER' AND start_time >= $1 AND start_time < $2
     GROUP BY 1
     ORDER BY count DESC, hour ASC`,
    [fromUtc, toUtc, groundTimezone]
  )
  return rows
}

/**
 * Simple status-count breakdown for a date range (Feature 11 "Bookings/Completed/Cancelled").
 * Phase 11 audit — optional groundId (default null = platform-wide, the
 * original Phase 18 legacy-staff-dashboard behavior via groundReport.service.js)
 * so Ground Owner analytics can scope this to their own ground without
 * touching that existing caller's cross-ground semantics.
 */
export async function countBookingsByStatus(fromUtc, toUtc, groundId = null) {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM ground_bookings
     WHERE booking_type = 'CUSTOMER' AND start_time >= $1 AND start_time < $2
       AND ($3::int IS NULL OR ground_id = $3)
     GROUP BY 1`,
    [fromUtc, toUtc, groundId]
  )
  return rows
}

/** Sum of booked/blocked hours in a range, for utilization (Feature 12) — CONFIRMED rows only, split by booking_type. */
// Phase 14 audit — optional groundId (default null = platform-wide, the
// original Phase 18 legacy-staff-dashboard behavior via groundReport.service.js,
// left unchanged for that existing caller), same pattern as
// countBookingsByStatus/searchBookings above.
export async function sumOccupiedHoursByType(fromUtc, toUtc, groundId = null) {
  const { rows } = await pool.query(
    `SELECT booking_type, COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0)::float AS hours
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND start_time >= $1 AND start_time < $2
       AND ($3::int IS NULL OR ground_id = $3)
     GROUP BY 1`,
    [fromUtc, toUtc, groundId]
  )
  return rows
}

// Phase 16 — day-by-day booking trend, one GROUP BY query for the whole
// range (never a per-day loop). booking_type + day so the caller can
// separate CUSTOMER bookings from STAFF_BLOCK, same distinction
// sumOccupiedHoursByType already makes for the snapshot version.
export async function dailyBookingCountsForGround(groundId, fromUtc, toUtc) {
  const { rows } = await pool.query(
    `SELECT date_trunc('day', start_time)::date AS day, booking_type, COUNT(*)::int AS count
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND start_time >= $1 AND start_time < $2 AND ground_id = $3
     GROUP BY 1, 2
     ORDER BY 1`,
    [fromUtc, toUtc, groundId],
  )
  return rows
}

// Phase 16 — day-by-day occupied hours for the utilization trend, same
// single-query-for-the-whole-range shape as dailyBookingCountsForGround.
export async function dailyOccupiedHoursForGround(groundId, fromUtc, toUtc) {
  const { rows } = await pool.query(
    `SELECT date_trunc('day', start_time)::date AS day, booking_type,
            COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600), 0)::float AS hours
     FROM ground_bookings
     WHERE status = 'CONFIRMED' AND start_time >= $1 AND start_time < $2 AND ground_id = $3
     GROUP BY 1, 2
     ORDER BY 1`,
    [fromUtc, toUtc, groundId],
  )
  return rows
}
