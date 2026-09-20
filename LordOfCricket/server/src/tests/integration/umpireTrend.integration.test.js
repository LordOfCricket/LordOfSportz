// Umpire Intelligence & Scale 2.0 — GET /umpire/statistics/trend. Real
// event/rating rows dated into specific past months, verifying the
// per-month breakdown is accurate and that months with no real history
// report null (never a fabricated 0/period).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'

function stubIo() {
  const chain = { emit: () => {} }
  return { emit: () => {}, to: () => chain }
}

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = stubIo()
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return {
    baseUrl: `http://localhost:${port}/api`,
    async close() {
      await new Promise((resolve) => httpServer.close(resolve))
    },
  }
}

async function json(url, { method = 'GET', token } = {}) {
  const res = await fetch(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  return { status: res.status, data: await res.json() }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-trend-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'TRA') RETURNING *`, [`Trend Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'TRB') RETURNING *`, [`Trend Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM match_feedback WHERE match_id IN (SELECT id FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1))', [
        [teamA.id, teamB.id],
      ])
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

// Inserts one completed slot + a COMPLETED event dated at `recordedAt`
// (an explicit past instant, so the trend's monthly bucketing can be tested
// deterministically) — bulk/direct SQL, mirroring the established pattern
// from umpireReputationScenarios.integration.test.js for exactly this kind
// of "backdated history fixture" need.
async function insertCompletedEventAt(teams, umpire, recordedAt) {
  const { rows: matchRows } = await pool.query(
    `INSERT INTO matches (team_a_id, team_b_id, match_date, status) VALUES ($1,$2,$3,'completed') RETURNING id`,
    [teams.teamA.id, teams.teamB.id, recordedAt],
  )
  const matchId = matchRows[0].id
  const { rows: slotRows } = await pool.query(
    `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at, completed_at) VALUES ($1,1,'COMPLETED',$2,$3,$3) RETURNING id`,
    [matchId, umpire.id, recordedAt],
  )
  await pool.query(
    `INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type, recorded_at) VALUES ($1,$2,$3,'COMPLETED',$4)`,
    [slotRows[0].id, matchId, umpire.id, recordedAt],
  )
  return matchId
}

async function insertRatingAt(teams, umpire, rating, createdAt) {
  const tag = uniqueTag()
  const { rows: reviewerRows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING id`,
    [`Integration Trend Reviewer ${tag}`, `integration-test-trend-reviewer-${tag}@example.test`],
  )
  const reviewerId = reviewerRows[0].id
  const { rows: matchRows } = await pool.query(
    `INSERT INTO matches (team_a_id, team_b_id, match_date, status) VALUES ($1,$2,$3,'completed') RETURNING id`,
    [teams.teamA.id, teams.teamB.id, createdAt],
  )
  const matchId = matchRows[0].id
  const { rows: feedbackRows } = await pool.query(
    `INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating, created_at) VALUES ($1,$2,5,5,$3) RETURNING id`,
    [matchId, reviewerId, createdAt],
  )
  await pool.query(`INSERT INTO match_feedback_umpire_ratings (match_feedback_id, umpire_user_id, rating, created_at) VALUES ($1,$2,$3,$4)`, [
    feedbackRows[0].id,
    umpire.id,
    rating,
    createdAt,
  ])
  return { matchId, reviewerId }
}

test('monthly trend reflects real per-month history exactly, and reports null (never a fabricated period) for a month with no data', async () => {
  const server = await startTestApp()
  const umpire = await createUser('trend', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  const cleanupExtra = []
  try {
    const now = new Date()
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12, 0, 0))
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12, 0, 0))

    // This month: 2 completed matches, 1 no-show.
    await insertCompletedEventAt(teams, umpire, thisMonth)
    await insertCompletedEventAt(teams, umpire, thisMonth)
    const noShowMatch = (await pool.query(`INSERT INTO matches (team_a_id, team_b_id, match_date, status) VALUES ($1,$2,$3,'completed') RETURNING id`, [
      teams.teamA.id,
      teams.teamB.id,
      thisMonth,
    ])).rows[0].id
    const noShowSlot = (await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id) VALUES ($1,1,'NO_SHOW',$2) RETURNING id`,
      [noShowMatch, umpire.id],
    )).rows[0].id
    await pool.query(`INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type, recorded_at) VALUES ($1,$2,$3,'NO_SHOW',$4)`, [
      noShowSlot,
      noShowMatch,
      umpire.id,
      thisMonth,
    ])
    // This month: ratings 5 and 4 -> avg 4.5.
    const r1 = await insertRatingAt(teams, umpire, 5, thisMonth)
    const r2 = await insertRatingAt(teams, umpire, 4, thisMonth)
    cleanupExtra.push(r1.reviewerId, r2.reviewerId)

    // Last month: 1 completed match only, no ratings.
    await insertCompletedEventAt(teams, umpire, lastMonth)

    const res = await json(`${server.baseUrl}/umpire/statistics/trend?months=3`, { token: umpire.token })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.months.length, 3)

    const thisMonthEntry = res.data.months[res.data.months.length - 1]
    const lastMonthEntry = res.data.months[res.data.months.length - 2]
    const emptyMonthEntry = res.data.months[res.data.months.length - 3]

    assert.equal(thisMonthEntry.matchesOfficiated, 2)
    // reliability = completed/(completed+noShows+cancellations) = 2/3 = 66.67 -> 67
    assert.equal(thisMonthEntry.reliability, 67)
    assert.equal(thisMonthEntry.ratingAvg, 4.5)

    assert.equal(lastMonthEntry.matchesOfficiated, 1)
    assert.equal(lastMonthEntry.reliability, 100)
    assert.equal(lastMonthEntry.ratingAvg, null, 'no ratings that month — null, never 0 or fabricated')

    assert.equal(emptyMonthEntry.matchesOfficiated, 0)
    assert.equal(emptyMonthEntry.reliability, null, 'no terminal history that month — null, never a fabricated percentage')
    assert.equal(emptyMonthEntry.ratingAvg, null)
  } finally {
    for (const reviewerId of cleanupExtra) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query('DELETE FROM users WHERE id = $1', [reviewerId])
    }
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('trend endpoint is self-scoped and denied to non-umpires', async () => {
  const server = await startTestApp()
  const player = await createUser('trend-player')
  try {
    const asPlayer = await json(`${server.baseUrl}/umpire/statistics/trend`, { token: player.token })
    assert.equal(asPlayer.status, 403)

    const noAuth = await json(`${server.baseUrl}/umpire/statistics/trend`)
    assert.equal(noAuth.status, 401)
  } finally {
    await player.cleanup()
    await server.close()
  }
})
