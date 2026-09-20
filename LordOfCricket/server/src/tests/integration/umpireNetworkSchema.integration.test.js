// Phase 21 (U1) — Umpire Network database foundation. No models/services/
// routes exist yet for this feature (deliberately — U1 is schema-only per
// the approved plan), so these tests exercise the real constraints directly
// via pool.query, same pattern as groundCanteen.integration.test.js's
// "grounds.slug is uniquely constrained at the database level" tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'

async function makeUser(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-umpire-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`],
  )
  return rows[0]
}

async function makeTeams() {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Umpire Test Team A','UTA') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Umpire Test Team B','UTB') RETURNING *`)).rows[0]
  return { teamA, teamB }
}

async function makeMatch(teamA, teamB, { groundId = null, requiredUmpires } = {}) {
  const cols = ['team_a_id', 'team_b_id', 'match_date']
  const vals = [teamA.id, teamB.id, new Date().toISOString()]
  if (groundId !== undefined && groundId !== null) {
    cols.push('ground_id')
    vals.push(groundId)
  }
  if (requiredUmpires !== undefined) {
    cols.push('required_umpires')
    vals.push(requiredUmpires)
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query(`INSERT INTO matches (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`, vals)
  return rows[0]
}

async function cleanupMatch(matchId) {
  await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [matchId])
  await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
  await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
}

async function cleanupTeams(teamA, teamB) {
  await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
}

async function cleanupUsers(...users) {
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [users.map((u) => u.id)])
}

test('matches.ground_id is nullable — existing (pre-Phase-21-style) matches remain valid', async () => {
  const { teamA, teamB } = await makeTeams()
  try {
    const match = await makeMatch(teamA, teamB)
    assert.equal(match.ground_id, null)
    assert.equal(match.required_umpires, 0, 'required_umpires must default to 0 for backward compatibility')
    await cleanupMatch(match.id)
  } finally {
    await cleanupTeams(teamA, teamB)
  }
})

test('matches.required_umpires rejects a negative value', async () => {
  const { teamA, teamB } = await makeTeams()
  try {
    await assert.rejects(() => makeMatch(teamA, teamB, { requiredUmpires: -1 }), (err) => err.code === '23514')
  } finally {
    await cleanupTeams(teamA, teamB)
  }
})

test('match_umpire_slots.slot_number is unique per match', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB, { requiredUmpires: 2 })
  try {
    await pool.query(`INSERT INTO match_umpire_slots (match_id, slot_number) VALUES ($1, 1)`, [match.id])
    await assert.rejects(
      () => pool.query(`INSERT INTO match_umpire_slots (match_id, slot_number) VALUES ($1, 1)`, [match.id]),
      (err) => err.code === '23505',
    )
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
  }
})

test('match_umpire_slots rejects an invalid status value', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB, { requiredUmpires: 1 })
  try {
    await assert.rejects(
      () => pool.query(`INSERT INTO match_umpire_slots (match_id, slot_number, status) VALUES ($1, 1, 'BOGUS')`, [match.id]),
      (err) => err.code === '23514',
    )
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
  }
})

test('the same umpire cannot hold two ASSIGNED slots on the same match (Decision 3)', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB, { requiredUmpires: 2 })
  const umpire = await makeUser('dup-assign')
  try {
    await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at) VALUES ($1, 1, 'ASSIGNED', $2, NOW())`,
      [match.id, umpire.id],
    )
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at) VALUES ($1, 2, 'ASSIGNED', $2, NOW())`,
          [match.id, umpire.id],
        ),
      (err) => err.code === '23505',
      'the partial unique index on (match_id, umpire_user_id) WHERE status=ASSIGNED must block this',
    )
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(umpire)
  }
})

test('the same umpire CAN hold slots on two different matches simultaneously', async () => {
  const { teamA, teamB } = await makeTeams()
  const matchOne = await makeMatch(teamA, teamB, { requiredUmpires: 1 })
  const matchTwo = await makeMatch(teamA, teamB, { requiredUmpires: 1 })
  const umpire = await makeUser('multi-match')
  try {
    await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at) VALUES ($1, 1, 'ASSIGNED', $2, NOW())`,
      [matchOne.id, umpire.id],
    )
    await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at) VALUES ($1, 1, 'ASSIGNED', $2, NOW())`,
      [matchTwo.id, umpire.id],
    )
  } finally {
    await cleanupMatch(matchOne.id)
    await cleanupMatch(matchTwo.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(umpire)
  }
})

test('a cancelled and a re-assigned slot on the same match do not collide (only ASSIGNED is exclusive)', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB, { requiredUmpires: 1 })
  const umpireOne = await makeUser('cancelled')
  const umpireTwo = await makeUser('reassigned')
  try {
    const { rows } = await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at) VALUES ($1, 1, 'ASSIGNED', $2, NOW()) RETURNING id`,
      [match.id, umpireOne.id],
    )
    await pool.query(
      `UPDATE match_umpire_slots SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = 'unavailable' WHERE id = $1`,
      [rows[0].id],
    )
    // Same slot row reclaimed by a different umpire — must succeed since the old row is no longer ASSIGNED.
    await pool.query(`UPDATE match_umpire_slots SET status = 'ASSIGNED', umpire_user_id = $2, assigned_at = NOW() WHERE id = $1`, [
      rows[0].id,
      umpireTwo.id,
    ])
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(umpireOne, umpireTwo)
  }
})

test('umpire_profiles is a true 1:1 with users — a second row for the same user is rejected', async () => {
  const umpire = await makeUser('profile-11')
  try {
    await pool.query(`INSERT INTO umpire_profiles (user_id) VALUES ($1)`, [umpire.id])
    await assert.rejects(() => pool.query(`INSERT INTO umpire_profiles (user_id) VALUES ($1)`, [umpire.id]), (err) => err.code === '23505')
  } finally {
    await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [umpire.id])
    await cleanupUsers(umpire)
  }
})

test('deleting a user cascades to delete their umpire_profiles row', async () => {
  const umpire = await makeUser('profile-cascade')
  await pool.query(`INSERT INTO umpire_profiles (user_id) VALUES ($1)`, [umpire.id])
  await pool.query('DELETE FROM users WHERE id = $1', [umpire.id])
  const { rows } = await pool.query('SELECT * FROM umpire_profiles WHERE user_id = $1', [umpire.id])
  assert.equal(rows.length, 0)
})

test('match_feedback enforces one submission per (match, submitted_by)', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB)
  const participant = await makeUser('feedback-dup')
  try {
    await pool.query(
      `INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating) VALUES ($1, $2, 4, 5)`,
      [match.id, participant.id],
    )
    await assert.rejects(
      () => pool.query(`INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating) VALUES ($1, $2, 3, 3)`, [match.id, participant.id]),
      (err) => err.code === '23505',
    )
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(participant)
  }
})

test('match_feedback rejects an out-of-range rating', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB)
  const participant = await makeUser('feedback-range')
  try {
    await assert.rejects(
      () => pool.query(`INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating) VALUES ($1, $2, 6, 3)`, [match.id, participant.id]),
      (err) => err.code === '23514',
    )
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(participant)
  }
})

// U6 note: this originally asserted match_feedback.umpire_rating/
// umpire_user_id were null when omitted. U6 moved per-umpire ratings to a
// dedicated child table (match_feedback_umpire_ratings) — see U6's report
// for why (a match can have more than one assigned umpire, which a single
// nullable column on match_feedback could never represent) — so those two
// columns no longer exist on match_feedback at all. Updated to assert the
// equivalent, schema-current fact: a feedback row with no umpire rating
// simply has zero matching child-table rows.
test('match_feedback allows a submission with no umpire rating at all (matches with no assigned umpire)', async () => {
  const { teamA, teamB } = await makeTeams()
  const match = await makeMatch(teamA, teamB)
  const participant = await makeUser('feedback-no-umpire')
  try {
    const { rows } = await pool.query(
      `INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating) VALUES ($1, $2, 5, 5) RETURNING *`,
      [match.id, participant.id],
    )
    const { rows: umpireRatingRows } = await pool.query(`SELECT * FROM match_feedback_umpire_ratings WHERE match_feedback_id = $1`, [rows[0].id])
    assert.equal(umpireRatingRows.length, 0)
  } finally {
    await cleanupMatch(match.id)
    await cleanupTeams(teamA, teamB)
    await cleanupUsers(participant)
  }
})

test('grounds.rating_avg defaults to NULL and rating_count to 0 — no fabricated rating on existing grounds', async () => {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name) VALUES ('GRD-UMPTEST', 'umpire-test-ground-21', 'Umpire Test Ground') RETURNING *`,
  )
  try {
    assert.equal(rows[0].rating_avg, null)
    assert.equal(rows[0].rating_count, 0)
  } finally {
    await pool.query('DELETE FROM grounds WHERE id = $1', [rows[0].id])
  }
})

test('ground_notifications.type accepts both the pre-existing booking values and the new umpire values', async () => {
  const user = await makeUser('notif')
  try {
    const booking = await pool.query(
      `INSERT INTO ground_notifications (user_id, type, title) VALUES ($1, 'BOOKING_APPROVED', 'still works') RETURNING id`,
      [user.id],
    )
    const umpireNotif = await pool.query(
      `INSERT INTO ground_notifications (user_id, type, title) VALUES ($1, 'UMPIRE_SLOT_ASSIGNED', 'new value works') RETURNING id`,
      [user.id],
    )
    await pool.query('DELETE FROM ground_notifications WHERE id = ANY($1)', [[booking.rows[0].id, umpireNotif.rows[0].id]])
  } finally {
    await cleanupUsers(user)
  }
})

test('ground_notifications.type still rejects a bogus value', async () => {
  const user = await makeUser('notif-bogus')
  try {
    await assert.rejects(
      () => pool.query(`INSERT INTO ground_notifications (user_id, type, title) VALUES ($1, 'NOT_A_REAL_TYPE', 'x')`, [user.id]),
      (err) => err.code === '23514',
    )
  } finally {
    await cleanupUsers(user)
  }
})
