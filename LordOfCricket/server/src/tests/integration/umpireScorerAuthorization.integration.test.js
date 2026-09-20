// Phase 21 (U2, revised U5.1, Phase 7 Umpire Module cleanup) — closes the
// gap the Phase 0 audit found: player_type='umpire' alone used to be enough
// to pass scorer checks, even though it is set the moment a user REQUESTS
// umpire status (selectPlayerType), before any admin decision. The gate
// must also confirm the user's LATEST umpire_requests row is 'approved'.
//
// Phase 7 note: this file used to exercise requireScorer (middlewares/
// auth.js) through a disposable test-only Express route, since requireScorer
// itself had zero production routes using it (match-scoped routes moved to
// requireMatchScorer back in U3). Phase 7's dead-code audit proved
// requireScorer was fully unreachable in production and deleted it — but
// the actual logic worth testing here was never requireScorer's own
// wrapper, it was Gate 1 underneath it: isApprovedUmpireUser
// (umpireRequest.model.js), the single shared "is this user an approved
// umpire" predicate every real gate (requireMatchScorer, umpireAssignment.
// service.js, umpireProposal.service.js) still calls. So this file now
// calls isApprovedUmpireUser directly — no HTTP layer, no disposable route,
// same exact scenarios (pending/approved/rejected/no-request/latest-wins-
// across-multiple-requests), now testing the real, live, still-used
// function instead of a wrapper that no longer has any callers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { isApprovedUmpireUser } from '../../models/umpireRequest.model.js'

// playerType null|'team_player'|'umpire'; requestStatuses is an ordered list
// of umpire_requests rows to insert (oldest first) so multi-request /
// latest-wins scenarios can be set up directly, independent of the
// selectPlayerType application flow.
async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u2-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType],
  )
  const user = rows[0]

  const requestIds = []
  for (const status of requestStatuses) {
    // decided_at computed in JS, not via `CASE WHEN $2 = ...` in SQL — reusing
    // the same parameter both as the inserted value and inside a CASE
    // comparison makes Postgres deduce two different types for $2
    // (varchar vs text) and reject the query with "inconsistent types
    // deduced for parameter $2" (42P08).
    const decidedAt = status === 'pending' ? null : new Date()
    const { rows: reqRows } = await pool.query(
      `INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, status, decidedAt],
    )
    requestIds.push(reqRows[0].id)
    // Stagger requested_at so "latest" is unambiguous and deterministic —
    // otherwise same-millisecond inserts could tie on ORDER BY requested_at DESC.
    await pool.query(`UPDATE umpire_requests SET requested_at = requested_at + ($2 || ' milliseconds')::interval WHERE id = $1`, [
      reqRows[0].id,
      requestIds.length * 10,
    ])
  }

  return {
    id: user.id,
    row: user,
    async cleanup() {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

test('Case 1 — a PENDING umpire request is NOT an approved umpire: denied', async () => {
  const user = await makeUser({ label: 'pending', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false)
  } finally {
    await user.cleanup()
  }
})

test('Case 2 — an APPROVED umpire request grants approval', async () => {
  const user = await makeUser({ label: 'approved', playerType: 'umpire', requestStatuses: ['approved'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), true)
  } finally {
    await user.cleanup()
  }
})

test('Case 3 — a REJECTED umpire request is NOT an approved umpire: denied', async () => {
  const user = await makeUser({ label: 'rejected', playerType: 'umpire', requestStatuses: ['rejected'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false)
  } finally {
    await user.cleanup()
  }
})

test('Case 4 — a normal team_player is denied regardless of request history', async () => {
  const user = await makeUser({ label: 'team-player', playerType: 'team_player' })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false)
  } finally {
    await user.cleanup()
  }
})

test('a user with no umpire_requests row at all (never requested) is denied, even with player_type=umpire', async () => {
  const user = await makeUser({ label: 'no-request', playerType: 'umpire', requestStatuses: [] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false)
  } finally {
    await user.cleanup()
  }
})

test('Case 6a — multiple requests: an old APPROVED request followed by a newer REJECTED one denies access (latest wins)', async () => {
  const user = await makeUser({ label: 'approved-then-rejected', playerType: 'umpire', requestStatuses: ['approved', 'rejected'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false, 'a previously-approved umpire whose standing was later rejected must lose access immediately')
  } finally {
    await user.cleanup()
  }
})

test('Case 6b — multiple requests: an old REJECTED request followed by a newer APPROVED one grants access (latest wins)', async () => {
  const user = await makeUser({ label: 'rejected-then-approved', playerType: 'umpire', requestStatuses: ['rejected', 'approved'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), true)
  } finally {
    await user.cleanup()
  }
})

test('Case 6c — multiple requests: old APPROVED followed by a newer still-PENDING re-request denies access', async () => {
  const user = await makeUser({ label: 'approved-then-pending', playerType: 'umpire', requestStatuses: ['approved', 'pending'] })
  try {
    assert.equal(await isApprovedUmpireUser(user.row), false, 'a pending re-request must not inherit authorization from an earlier, now-superseded approval')
  } finally {
    await user.cleanup()
  }
})
