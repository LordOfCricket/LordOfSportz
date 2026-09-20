import { pool } from '../config/db.js'

// Phase 6 — short-lived, single-use step-up grants. session_id is always
// passed as a String — sessions.id is a Prisma BigInt, and this is the
// first place in this codebase a Prisma-sourced id crosses into a raw `pg`
// query; String() avoids any ambiguity in how `pg` would otherwise
// serialize a JS BigInt.

export async function findActiveGrant(sessionId, actionScope) {
  const { rows } = await pool.query(
    `SELECT * FROM step_up_grants WHERE session_id = $1 AND action_scope = $2 AND used_at IS NULL AND expires_at > NOW()`,
    [String(sessionId), actionScope],
  )
  return rows[0] || null
}

export async function issueGrant({ sessionId, userId, actionScope, expiresAt }) {
  const { rows } = await pool.query(
    `INSERT INTO step_up_grants (session_id, user_id, action_scope, expires_at) VALUES ($1, $2, $3, $4) RETURNING *`,
    [String(sessionId), userId, actionScope, expiresAt],
  )
  return rows[0]
}

// The entire concurrency guard: consumed exactly once, inside the SAME
// transaction as the gated mutation itself (never a separate middleware
// pass — see stepUp.service.js's own header comment for why). Zero rows
// back means "no fresh grant" — the caller must throw and let its own
// ROLLBACK undo everything, including this consumption attempt.
export async function consumeGrant(sessionId, actionScope, client = pool) {
  const { rows } = await client.query(
    `UPDATE step_up_grants SET used_at = NOW()
     WHERE session_id = $1 AND action_scope = $2 AND used_at IS NULL AND expires_at > NOW()
     RETURNING *`,
    [String(sessionId), actionScope],
  )
  return rows[0] || null
}
