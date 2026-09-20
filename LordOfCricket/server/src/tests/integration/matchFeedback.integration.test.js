// Phase 22 (U6) — post-match feedback (Ground/Umpire/App), eligibility,
// spoofing protection, aggregation. Real HTTP against the real app, same
// pattern as every prior U-phase test file.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { createPlayer } from '../../models/player.model.js'
import { createMatchPlayer } from '../../repositories/matchPlayer.repository.js'
import * as matchService from '../../services/match.service.js'
import { recalculateGroundRating, recalculateUmpireRating } from '../../services/ratingAggregation.service.js'

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

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

async function makeUser({ label, role = 'player', playerType = null, staffRoleName = null, requestStatuses = [] }) {
  let staffRoleId = null
  if (staffRoleName) {
    staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = $1`, [staffRoleName])).rows[0].id
  }
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4,$5) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u6-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
  )
  const user = rows[0]
  for (const status of requestStatuses) {
    const decidedAt = status === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, status, decidedAt])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM match_feedback WHERE submitted_by = $1', [user.id])
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM players WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function makeGround(label, status = 'ACTIVE') {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,$4) RETURNING *`,
    [generatePublicId('GRD', 8), `integration-test-u6-ground-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`, status],
  )
  return rows[0]
}

async function makeTeams(label) {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U6A') RETURNING *`, [`U6 Team A ${label}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U6B') RETURNING *`, [`U6 Team B ${label}`])).rows[0]
  return { teamA, teamB }
}

// Creates an upcoming match with a real ground + real slots, optionally
// seats a participant (linked to a real user) and applies real umpire(s) via
// the actual U3 apply flow, THEN forces the match to 'completed' (bypassing
// full ball-by-ball scoring — the same shortcut every prior U-phase test
// file already uses for auth/eligibility-focused tests).
async function makeCompletedMatchFixture({ groundId = null, requiredUmpires = 0, umpireTokens = [], participantUser = null, matchDate = new Date().toISOString() } = {}) {
  const teams = await makeTeams(Math.random().toString(36).slice(2))
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate,
    groundId,
    requiredUmpires,
  })

  const server = await startTestApp()
  try {
    for (const token of umpireTokens) {
      const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token })
      assert.equal(applied.status, 201, `umpire apply must succeed during fixture setup: ${JSON.stringify(applied.data)}`)
    }
  } finally {
    await server.close()
  }

  let matchPlayerRow = null
  if (participantUser) {
    const player = await createPlayer({ name: `Fixture Player`, teamId: teams.teamA.id, role: 'Batter', userId: participantUser.id })
    matchPlayerRow = await createMatchPlayer({ matchId: match.id, teamId: teams.teamA.id, playerId: player.id })
  }

  await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])

  return {
    match,
    teams,
    matchPlayerRow,
    async cleanup() {
      await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE match_feedback_id IN (SELECT id FROM match_feedback WHERE match_id = $1)', [match.id])
      await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM match_players WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
      if (matchPlayerRow) await pool.query('DELETE FROM players WHERE id = $1', [matchPlayerRow.player_id])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    },
  }
}

// ---------------------------------------------------------------------------
// Eligibility & submission
// ---------------------------------------------------------------------------

test('1 — an eligible participant (match_players) can submit feedback after completion', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'participant' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { appRating: 5, appCommentLiked: 'Loved it' },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.feedback.submitted_by, player.id)
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('2 — an eligible assigned umpire can submit ground+app+co-umpire feedback after completion', async () => {
  const server = await startTestApp()
  const ground = await makeGround('elig-umpire')
  const umpireA = await approvedUmpire('elig-umpire-a')
  const umpireB = await approvedUmpire('elig-umpire-b')
  const fx = await makeCompletedMatchFixture({ groundId: ground.id, requiredUmpires: 2, umpireTokens: [umpireA.token, umpireB.token] })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: umpireA.token,
      body: {
        groundRating: 4,
        appRating: 5,
        umpireRatings: [{ umpireUserId: umpireB.id, rating: 5, commentLiked: 'Great partner umpire' }],
      },
    })
    assert.equal(status, 201, JSON.stringify(data))
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await fx.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('3 — an eligible ground owner can submit umpire+app feedback, but NOT ground feedback for their own ground', async () => {
  const server = await startTestApp()
  const ground = await makeGround('elig-owner')
  const owner = await makeUser({ label: 'elig-owner' })
  const umpire = await approvedUmpire('elig-owner-umpire')
  const fx = await makeCompletedMatchFixture({ groundId: ground.id, requiredUmpires: 1, umpireTokens: [umpire.token] })
  try {
    await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })

    const allowed = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: owner.token,
      body: { appRating: 4, umpireRatings: [{ umpireUserId: umpire.id, rating: 5 }] },
    })
    assert.equal(allowed.status, 201, JSON.stringify(allowed.data))

    await pool.query('DELETE FROM match_feedback WHERE match_id = $1 AND submitted_by = $2', [fx.match.id, owner.id])

    const denied = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: owner.token,
      body: { groundRating: 5, appRating: 4 },
    })
    assert.equal(denied.status, 403, JSON.stringify(denied.data))
    assert.equal(denied.data.code, 'INVALID_CATEGORY')
  } finally {
    await owner.cleanup()
    await umpire.cleanup()
    await fx.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('4 — an ineligible normal user (no relationship to the match) gets 403', async () => {
  const server = await startTestApp()
  const stranger = await makeUser({ label: 'stranger' })
  const fx = await makeCompletedMatchFixture()
  try {
    const { status } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: stranger.token, body: { appRating: 5 } })
    assert.equal(status, 403)
  } finally {
    await stranger.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('a legacy match with no ground (ground_id=NULL) never offers the ground category, even to an eligible participant', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'no-ground' })
  const fx = await makeCompletedMatchFixture({ participantUser: player }) // no groundId passed
  try {
    assert.equal(fx.match.ground_id, null, 'test setup sanity check')

    const context = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { token: player.token })
    assert.equal(context.data.categories.ground, false)

    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { groundRating: 5, appRating: 4 },
    })
    assert.equal(status, 403, JSON.stringify(data))
    assert.equal(data.code, 'INVALID_CATEGORY')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('5 — feedback before match completion (still live) is rejected', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'too-early' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [fx.match.id])
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 5 } })
    assert.equal(status, 409, JSON.stringify(data))
    assert.equal(data.code, 'MATCH_NOT_ELIGIBLE')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('6 — a duplicate submission gets a conflict, never a silent overwrite or a second row', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'dup' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const first = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 3 } })
    assert.equal(first.status, 201)

    const second = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 5 } })
    assert.equal(second.status, 409)
    assert.equal(second.data.code, 'ALREADY_SUBMITTED')

    const { rows } = await pool.query('SELECT * FROM match_feedback WHERE match_id = $1 AND submitted_by = $2', [fx.match.id, player.id])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].app_rating, 3, 'the original submission must be untouched')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('7 — the client cannot spoof submitted_by', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'spoof-submitter' })
  const someoneElse = await makeUser({ label: 'spoof-target' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { appRating: 5, submittedBy: someoneElse.id, submitted_by: someoneElse.id },
    })
    assert.equal(status, 201)
    assert.equal(data.feedback.submitted_by, player.id, 'must always be the authenticated user, never a client-supplied value')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await someoneElse.cleanup()
    await server.close()
  }
})

test('8 — the client cannot spoof ground_id: rating always applies to the match\'s real ground', async () => {
  const server = await startTestApp()
  const realGround = await makeGround('real-ground')
  const otherGround = await makeGround('other-ground')
  const player = await makeUser({ label: 'spoof-ground' })
  const fx = await makeCompletedMatchFixture({ groundId: realGround.id, participantUser: player })
  try {
    const { status } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { groundRating: 5, appRating: 4, groundId: otherGround.id, ground_id: otherGround.id },
    })
    assert.equal(status, 201)

    const other = await pool.query('SELECT rating_count FROM grounds WHERE id = $1', [otherGround.id])
    assert.equal(other.rows[0].rating_count, 0, 'the other ground must be completely unaffected')

    const real = await pool.query('SELECT rating_count FROM grounds WHERE id = $1', [realGround.id])
    assert.equal(real.rows[0].rating_count, 1, "the match's real ground must receive the rating")
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = ANY($1)', [[realGround.id, otherGround.id]])
    await server.close()
  }
})

test('9 — the client cannot rate an arbitrary umpire_user_id not assigned to the match', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'spoof-umpire' })
  const randomPerson = await makeUser({ label: 'spoof-umpire-target' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { appRating: 4, umpireRatings: [{ umpireUserId: randomPerson.id, rating: 5 }] },
    })
    assert.equal(status, 403, JSON.stringify(data))
    assert.equal(data.code, 'INVALID_UMPIRE')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await randomPerson.cleanup()
    await server.close()
  }
})

test('10 — an umpire cannot rate themselves', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('self-rate')
  const fx = await makeCompletedMatchFixture({ requiredUmpires: 1, umpireTokens: [umpire.token] })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: umpire.token,
      body: { appRating: 5, umpireRatings: [{ umpireUserId: umpire.id, rating: 5 }] },
    })
    assert.equal(status, 403, JSON.stringify(data))
    assert.equal(data.code, 'INVALID_UMPIRE')
  } finally {
    await umpire.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

test('11 — a user cannot rate a real umpire who was assigned to a DIFFERENT match', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'wrong-match-umpire' })
  const umpireElsewhere = await approvedUmpire('wrong-match-umpire-target')
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  const otherFx = await makeCompletedMatchFixture({ requiredUmpires: 1, umpireTokens: [umpireElsewhere.token] })
  try {
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { appRating: 4, umpireRatings: [{ umpireUserId: umpireElsewhere.id, rating: 5 }] },
    })
    assert.equal(status, 403, JSON.stringify(data))
    assert.equal(data.code, 'INVALID_UMPIRE')
  } finally {
    await fx.cleanup()
    await otherFx.cleanup()
    await player.cleanup()
    await umpireElsewhere.cleanup()
    await server.close()
  }
})

test('12 — invalid ratings (out of range / non-integer) are rejected', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'invalid-rating' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const tooHigh = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 6 } })
    assert.equal(tooHigh.status, 400)
    assert.equal(tooHigh.data.code, 'INVALID_RATING')

    const tooLow = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 0 } })
    assert.equal(tooLow.status, 400)

    const notInt = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 3.5 } })
    assert.equal(notInt.status, 400)
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('13 — an oversized comment is truncated (existing convention), not rejected', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'oversized-comment' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const longComment = 'x'.repeat(600)
    const { status, data } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { appRating: 4, appCommentLiked: longComment },
    })
    assert.equal(status, 201, JSON.stringify(data))
    assert.equal(data.feedback.app_comment_liked.length, 500)
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('14 — concurrent duplicate submissions: exactly one succeeds', async () => {
  const server = await startTestApp()
  const player = await makeUser({ label: 'race' })
  const fx = await makeCompletedMatchFixture({ participantUser: player })
  try {
    const [a, b] = await Promise.all([
      json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 4 } }),
      json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: player.token, body: { appRating: 5 } }),
    ])
    const statuses = [a.status, b.status].sort()
    assert.deepEqual(statuses, [201, 409], `expected exactly one 201 and one 409, got ${JSON.stringify(statuses)}`)

    const { rows } = await pool.query('SELECT * FROM match_feedback WHERE match_id = $1 AND submitted_by = $2', [fx.match.id, player.id])
    assert.equal(rows.length, 1, 'exactly one feedback row must exist — never zero, never two')
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await server.close()
  }
})

test('15 — rating aggregates are correct immediately after a real submission', async () => {
  const server = await startTestApp()
  const ground = await makeGround('agg-after-submit')
  const player = await makeUser({ label: 'agg-after-submit' })
  const fx = await makeCompletedMatchFixture({ groundId: ground.id, participantUser: player })
  try {
    const { status } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
      method: 'POST',
      token: player.token,
      body: { groundRating: 4, appRating: 5 },
    })
    assert.equal(status, 201)

    const { rows } = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [ground.id])
    assert.equal(Number(rows[0].rating_avg), 4)
    assert.equal(rows[0].rating_count, 1)
  } finally {
    await fx.cleanup()
    await player.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('GET feedback context reflects real eligibility/availability/already-submitted state', async () => {
  const server = await startTestApp()
  const ground = await makeGround('get-context')
  const umpireA = await approvedUmpire('get-context-a')
  const umpireB = await approvedUmpire('get-context-b')
  const fx = await makeCompletedMatchFixture({ groundId: ground.id, requiredUmpires: 2, umpireTokens: [umpireA.token, umpireB.token] })
  try {
    const before = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { token: umpireA.token })
    assert.equal(before.status, 200)
    assert.equal(before.data.available, true)
    assert.equal(before.data.alreadySubmitted, false)
    assert.equal(before.data.eligible, true)
    assert.deepEqual(before.data.categories, { ground: true, umpire: true, app: true })
    assert.equal(before.data.ratableUmpires.length, 1)
    assert.equal(before.data.ratableUmpires[0].userId, umpireB.id)

    await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { method: 'POST', token: umpireA.token, body: { appRating: 5 } })

    const after = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { token: umpireA.token })
    assert.equal(after.data.alreadySubmitted, true)
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await fx.cleanup()
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('GET feedback context: unavailable before completion, not eligible for a stranger', async () => {
  const server = await startTestApp()
  const stranger = await makeUser({ label: 'get-context-stranger' })
  const fx = await makeCompletedMatchFixture()
  try {
    await pool.query(`UPDATE matches SET status = 'upcoming' WHERE id = $1`, [fx.match.id])
    const unavailable = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { token: stranger.token })
    assert.equal(unavailable.status, 200)
    assert.equal(unavailable.data.available, false)

    await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [fx.match.id])
    const notEligible = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, { token: stranger.token })
    assert.equal(notEligible.data.available, true)
    assert.equal(notEligible.data.eligible, false)
  } finally {
    await stranger.cleanup()
    await fx.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

test('ground aggregation: average and count update correctly as ratings accumulate, unrelated grounds unaffected', async () => {
  const server = await startTestApp()
  const ground = await makeGround('agg-ground')
  const otherGround = await makeGround('agg-ground-other')
  const teams = await makeTeams('agg-ground')
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date().toISOString(), groundId: ground.id })
  await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [match.id])

  const users = []
  const cleanupUsers = async () => Promise.all(users.map((u) => u.cleanup()))
  try {
    const ratings = [5, 4, 3]
    for (const rating of ratings) {
      const u = await makeUser({ label: `agg-ground-${rating}-${users.length}` })
      users.push(u)
      const player = await createPlayer({ name: 'Agg Player', teamId: teams.teamA.id, role: 'Batter', userId: u.id })
      await createMatchPlayer({ matchId: match.id, teamId: teams.teamA.id, playerId: player.id })
      const { status, data } = await json(`${server.baseUrl}/matches/${match.id}/feedback`, { method: 'POST', token: u.token, body: { groundRating: rating } })
      assert.equal(status, 201, JSON.stringify(data))
    }

    const afterThree = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [ground.id])
    assert.equal(Number(afterThree.rows[0].rating_avg), 4.0)
    assert.equal(afterThree.rows[0].rating_count, 3)

    const u4 = await makeUser({ label: 'agg-ground-4th' })
    users.push(u4)
    const player4 = await createPlayer({ name: 'Agg Player 4', teamId: teams.teamA.id, role: 'Batter', userId: u4.id })
    await createMatchPlayer({ matchId: match.id, teamId: teams.teamA.id, playerId: player4.id })
    const fourth = await json(`${server.baseUrl}/matches/${match.id}/feedback`, { method: 'POST', token: u4.token, body: { groundRating: 5 } })
    assert.equal(fourth.status, 201)

    const afterFour = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [ground.id])
    assert.equal(Number(afterFour.rows[0].rating_avg), 4.25)
    assert.equal(afterFour.rows[0].rating_count, 4)

    const other = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [otherGround.id])
    assert.equal(other.rows[0].rating_avg, null)
    assert.equal(other.rows[0].rating_count, 0)
  } finally {
    await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM match_players WHERE match_id = $1', [match.id])
    await cleanupUsers()
    const playerIds = (await pool.query('SELECT id FROM players WHERE team_id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])).rows.map((r) => r.id)
    if (playerIds.length) await pool.query('DELETE FROM players WHERE id = ANY($1)', [playerIds])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = ANY($1)', [[ground.id, otherGround.id]])
    await server.close()
  }
})

test('umpire aggregation: average and count update correctly, unrelated umpires unaffected', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('agg-umpire')
  const otherUmpire = await approvedUmpire('agg-umpire-other')
  const raters = []
  const matches = []
  try {
    const ratings = [5, 4, 3, 5]
    for (const [i, rating] of ratings.entries()) {
      // Spaced a day apart — the umpire double-booking check (this same
      // umpire applies for all four) treats an ASSIGNED slot as active
      // regardless of the match's own completed/finalized status (nothing
      // ever demotes a slot away from ASSIGNED — see matchUmpireSlot.model.js),
      // so these four fixtures need real, non-overlapping match_date values,
      // not four calls at effectively the same instant.
      const fx = await makeCompletedMatchFixture({
        requiredUmpires: 1,
        umpireTokens: [umpire.token],
        matchDate: new Date(Date.now() + i * 86400000).toISOString(),
      })
      matches.push(fx)
      const rater = await makeUser({ label: `agg-umpire-rater-${raters.length}` })
      raters.push(rater)
      const player = await createPlayer({ name: 'Rater Player', teamId: fx.teams.teamA.id, role: 'Batter', userId: rater.id })
      await createMatchPlayer({ matchId: fx.match.id, teamId: fx.teams.teamA.id, playerId: player.id })
      const { status } = await json(`${server.baseUrl}/matches/${fx.match.id}/feedback`, {
        method: 'POST',
        token: rater.token,
        body: { umpireRatings: [{ umpireUserId: umpire.id, rating }] },
      })
      assert.equal(status, 201)
    }

    const { rows } = await pool.query('SELECT rating_avg, rating_count FROM umpire_profiles WHERE user_id = $1', [umpire.id])
    assert.equal(Number(rows[0].rating_avg), 4.25)
    assert.equal(rows[0].rating_count, 4)

    const other = await pool.query('SELECT rating_avg, rating_count FROM umpire_profiles WHERE user_id = $1', [otherUmpire.id])
    assert.equal(other.rows[0]?.rating_avg ?? null, null)
  } finally {
    await Promise.all(matches.map((m) => m.cleanup()))
    await Promise.all(raters.map((r) => r.cleanup()))
    await umpire.cleanup()
    await otherUmpire.cleanup()
    await server.close()
  }
})

test('recalculateGroundRating/recalculateUmpireRating are standalone-recomputable from raw match_feedback rows', async () => {
  const ground = await makeGround('recompute')
  const umpire = await approvedUmpire('recompute-umpire')
  const teams = await makeTeams('recompute')
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date().toISOString(), groundId: ground.id })
  const rater = await makeUser({ label: 'recompute-rater' })
  try {
    const { rows: fbRows } = await pool.query(
      `INSERT INTO match_feedback (match_id, submitted_by, ground_rating) VALUES ($1, $2, 5) RETURNING id`,
      [match.id, rater.id],
    )
    await pool.query(`INSERT INTO match_feedback_umpire_ratings (match_feedback_id, umpire_user_id, rating) VALUES ($1, $2, 3)`, [fbRows[0].id, umpire.id])

    // Corrupt the cached aggregate directly, proving recompute never trusts it.
    await pool.query('UPDATE grounds SET rating_avg = 1.00, rating_count = 999 WHERE id = $1', [ground.id])
    await pool.query('UPDATE umpire_profiles SET rating_avg = 1.00, rating_count = 999 WHERE user_id = $1', [umpire.id])

    const groundResult = await recalculateGroundRating(ground.id)
    assert.equal(Number(groundResult.ratingAvg), 5)
    assert.equal(groundResult.ratingCount, 1)

    const umpireResult = await recalculateUmpireRating(umpire.id)
    assert.equal(Number(umpireResult.ratingAvg), 3)
    assert.equal(umpireResult.ratingCount, 1)

    const { rows: groundRows } = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [ground.id])
    assert.equal(Number(groundRows[0].rating_avg), 5)
    assert.equal(groundRows[0].rating_count, 1)
  } finally {
    await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1', [umpire.id])
    await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [match.id])
    await rater.cleanup()
    await umpire.cleanup()
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  }
})
