import { pool } from '../config/db.js'

// Weekly recurring rules — at most one row per (umpire, day_of_week), an
// upsert so setting a day twice never creates a duplicate.
export async function findWeeklyAvailability(userId, client = pool) {
  const { rows } = await client.query(`SELECT day_of_week, is_available FROM umpire_weekly_availability WHERE umpire_user_id = $1 ORDER BY day_of_week`, [
    userId,
  ])
  return rows
}

export async function upsertWeeklyAvailability(userId, dayOfWeek, isAvailable) {
  const { rows } = await pool.query(
    `INSERT INTO umpire_weekly_availability (umpire_user_id, day_of_week, is_available)
     VALUES ($1, $2, $3)
     ON CONFLICT (umpire_user_id, day_of_week) DO UPDATE SET is_available = $3
     RETURNING day_of_week, is_available`,
    [userId, dayOfWeek, isAvailable],
  )
  return rows[0]
}

// Date-specific overrides — at most one row per (umpire, specific_date); a
// later PATCH for the same date replaces the earlier one rather than
// stacking rows (single-window-per-date, per the task's own examples).
export async function findDateAvailability(userId, client = pool) {
  // specific_date::text — node-postgres's default DATE parser returns a JS
  // Date object (local-midnight-shifted-to-UTC, an off-by-one-day trap in
  // some timezones), not the plain 'YYYY-MM-DD' string every caller here
  // actually needs (isUmpireAvailableForMatch compares it as a string).
  const { rows } = await client.query(
    `SELECT specific_date::text AS specific_date, start_time, end_time, is_available
     FROM umpire_date_availability
     WHERE umpire_user_id = $1 AND specific_date >= CURRENT_DATE
     ORDER BY specific_date`,
    [userId],
  )
  return rows
}

export async function upsertDateAvailability(userId, { specificDate, startTime, endTime, isAvailable }) {
  const { rows } = await pool.query(
    `INSERT INTO umpire_date_availability (umpire_user_id, specific_date, start_time, end_time, is_available)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (umpire_user_id, specific_date) DO UPDATE
       SET start_time = $3, end_time = $4, is_available = $5
     RETURNING specific_date::text AS specific_date, start_time, end_time, is_available`,
    [userId, specificDate, startTime ?? null, endTime ?? null, isAvailable],
  )
  return rows[0]
}

export async function deleteDateAvailability(userId, specificDate) {
  await pool.query(`DELETE FROM umpire_date_availability WHERE umpire_user_id = $1 AND specific_date = $2`, [userId, specificDate])
}
