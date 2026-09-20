import { pool } from '../config/db.js'

// Phase 6 — short-lived, single-use WebAuthn ceremony challenges. See
// schema.sql's own comment on why user_id is always NOT NULL here (WebAuthn
// is strictly a second factor on an already-OTP-authenticated session in
// this app, never passwordless first-factor login).

export async function createChallenge({ userId, challenge, purpose, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, challenge, purpose, expiresAt],
  )
  return rows[0]
}

// Single-use: the WHERE clause guards against replaying the same challenge
// twice (e.g. a duplicated network retry racing itself) — zero rows back
// means "already used, expired, or never existed," and the caller must
// treat all three identically (never reveal which).
export async function consumeChallenge({ userId, purpose }) {
  const { rows } = await pool.query(
    `UPDATE webauthn_challenges
     SET consumed_at = NOW()
     WHERE id = (
       SELECT id FROM webauthn_challenges
       WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1
     )
     RETURNING *`,
    [userId, purpose],
  )
  return rows[0] || null
}
