import { pool } from '../config/db.js'

// A true 1:1 with users (U1) — created lazily on first real access, never
// backfilled for every user. INSERT ... ON CONFLICT DO NOTHING is the
// get-or-create: safe to call on every profile read/write, never duplicates,
// never overwrites an existing row's real values with defaults.
export async function getOrCreateUmpireProfile(userId) {
  await pool.query(`INSERT INTO umpire_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId])
  const { rows } = await pool.query(`SELECT * FROM umpire_profiles WHERE user_id = $1`, [userId])
  return rows[0]
}

// Same upsert shape as getOrCreateUmpireProfile — safe even if this is the
// very first time this user's row is touched (no prior GET required).
export async function updateUmpireProfile(userId, { bio, isAvailable }) {
  const { rows } = await pool.query(
    `INSERT INTO umpire_profiles (user_id, bio, is_available)
     VALUES ($1, $2, COALESCE($3, true))
     ON CONFLICT (user_id) DO UPDATE
       SET bio = COALESCE($2, umpire_profiles.bio),
           is_available = COALESCE($3, umpire_profiles.is_available),
           updated_at = NOW()
     RETURNING *`,
    [userId, bio ?? null, isAvailable ?? null],
  )
  return rows[0]
}
