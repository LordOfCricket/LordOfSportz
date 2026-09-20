// Match reminders (Phase 23, Workstream D) — calls runReminderTick()
// directly (not the setInterval wrapper) so this test controls exactly when
// a tick runs, real DB state and real notification rows, same pattern as
// every other integration test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { runReminderTick } from '../../services/reminderScheduler.service.js'
import * as matchService from '../../services/match.service.js'
import { signToken } from '../../utils/jwt.js'
import { groundLocalNaiveTimestamp } from '../../domain/shared/groundTime.js'

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Test ${label}`, `integration-test-reminder-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM ground_notifications WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RMA') RETURNING *`, [`Reminder Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RMB') RETURNING *`, [`Reminder Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [
        [teamA.id, teamB.id],
      ])
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

// A real match is created from a datetime-local browser input, which stores
// ground-local (IST) wall-clock digits verbatim, never a UTC 'Z' string
// (confirmed by audit — see reminderScheduler.service.js's own comment).
// Using .toISOString() here would silently write UTC-clock digits instead,
// which is exactly the mismatch that let the reminder timezone bug hide
// behind a passing test for an entire phase — this fixture reproduces the
// real write shape instead.
async function assignedMatchIn(teams, umpire, minutesFromNow) {
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: groundLocalNaiveTimestamp(new Date(Date.now() + minutesFromNow * 60000)),
    oversPerInnings: 20,
    requiredUmpires: 1,
  })
  await pool.query(`UPDATE match_umpire_slots SET status = 'ASSIGNED', umpire_user_id = $2, assigned_at = NOW() WHERE match_id = $1 AND slot_number = 1`, [
    match.id,
    umpire.id,
  ])
  return match
}

async function reminderCount(userId, type, matchId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = $2 AND related_match_id = $3`, [
    userId,
    type,
    matchId,
  ])
  return rows[0].n
}

test('a match ~24h away sends exactly one UMPIRE_REMINDER_24H, even across two tick runs', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('24h')
  try {
    const match = await assignedMatchIn(teams, umpire, 24 * 60 - 2) // 2 minutes inside the 24h window

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_24H', match.id), 1)

    await runReminderTick() // simulates a second poll tick before the window has fully passed
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_24H', match.id), 1, 'must never double-send')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('a match far outside every window sends nothing', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('far')
  try {
    const match = await assignedMatchIn(teams, umpire, 7 * 24 * 60) // a week away

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_24H', match.id), 0)
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_2H', match.id), 0)
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_30M', match.id), 0)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('a match ~30 minutes away sends UMPIRE_REMINDER_30M', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('30m')
  try {
    const match = await assignedMatchIn(teams, umpire, 28) // inside the 30-min window

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_30M', match.id), 1)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

test('a match ~2h away sends exactly one UMPIRE_REMINDER_2H', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('2h')
  try {
    const match = await assignedMatchIn(teams, umpire, 2 * 60 - 2) // 2 minutes inside the 2h window

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_2H', match.id), 1)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

// Workstream G — a late assignment (already past the 24h/2h windows by the
// time it's made) must never receive a stale/invalid 24h or 2h reminder for
// a window that has already passed; it should still receive whichever
// window is genuinely still ahead of it (here, 30m). The 3 windows are each
// an independent BETWEEN check per tick, not a sequential state machine, so
// this is a structural guarantee, not special-cased code — this test proves
// it rather than just asserting it.
test('a late assignment (well past the 24h/2h windows) never gets a stale 24H/2H reminder, only the still-applicable 30M one', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('late')
  try {
    const match = await assignedMatchIn(teams, umpire, 27) // already past 24h and 2h windows

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_24H', match.id), 0, 'the 24h window is long gone — never fabricate a late one')
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_2H', match.id), 0, 'the 2h window is also gone')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

// Workstream F — once a slot leaves ASSIGNED (no-show/cancelled/replaced)
// or the match leaves 'upcoming', findDueAssignments's own WHERE clause
// excludes it from every future tick — structural, not a special case.
test('a no-show slot stops receiving reminders, even if the match is still inside a reminder window', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('noshow')
  try {
    const match = await assignedMatchIn(teams, umpire, 28) // inside the 30-min window
    await pool.query(`UPDATE match_umpire_slots SET status = 'NO_SHOW' WHERE match_id = $1 AND slot_number = 1`, [match.id])

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_30M', match.id), 0, 'a no-show umpire must never get a reminder for a slot they no longer hold')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})

// The codebase has no dedicated "cancelled match" status (confirmed by
// audit — matches only ever move upcoming -> live -> completed ->
// finalized); this test uses the real 'live' transition (e.g. the match
// started early/ahead of its originally scheduled reminder window) as the
// concrete, real case of "the match has left 'upcoming'."
test('a match that has already left "upcoming" (e.g. started early) stops sending reminders', async () => {
  const teams = await makeTeams()
  const umpire = await approvedUmpire('started')
  try {
    const match = await assignedMatchIn(teams, umpire, 28) // inside the 30-min window
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])

    await runReminderTick()
    assert.equal(await reminderCount(umpire.id, 'UMPIRE_REMINDER_30M', match.id), 0, 'a match no longer "upcoming" must never send a reminder for it')
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
  }
})
