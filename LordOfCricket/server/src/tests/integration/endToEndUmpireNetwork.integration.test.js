// Phase 21 (U8) — end-to-end hardening: proves the FULL Umpire Network
// lifecycle works as one coherent system, not just as isolated per-phase
// unit tests. Every step goes through the real HTTP app with the real
// authorization middleware — including REAL ball-by-ball scoring (not the
// `UPDATE matches SET status=...` shortcut every prior U-phase test file
// used for speed), because the one thing no earlier test actually proved is
// that an umpire who only holds access via requireMatchScorer's live
// assignment check can genuinely drive a match through the real scoring
// engine end to end, and that access is genuinely revoked the moment the
// match completes — not just that a pre-set 'completed' row denies access.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import { randomUUID } from 'crypto'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { createPlayer } from '../../models/player.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

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

async function json(url, { method = 'GET', token, cookie, body } = {}) {
  const authHeaders = cookie ? { Cookie: cookie } : token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

// Phase 6 — requireGroundPermission's GROUND_OWNER branch now requires
// req.mfaVerified. `elevate` mints a REAL, already-MFA-verified session
// cookie — see helpers/mfaFixtures.js (this file isn't testing MFA, only
// the umpire network end-to-end flow).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [], staffRoleName = null }) {
  let staffRoleId = null
  if (staffRoleName) {
    staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = $1`, [staffRoleName])).rows[0].id
  }
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4,$5) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u8-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
  )
  const user = rows[0]
  for (const status of requestStatuses) {
    const decidedAt = status === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, status, decidedAt])
  }
  return { id: user.id, token: signToken({ id: user.id, name: user.name }) }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function bowlDotBall(server, token, inningsId, bowlerMatchPlayerId) {
  const state = await json(`${server.baseUrl}/innings/${inningsId}/state`, { token })
  return json(`${server.baseUrl}/innings/${inningsId}/deliveries`, {
    method: 'POST',
    token,
    body: { expectedVersion: state.data.innings.version, clientActionId: randomUUID(), batRuns: 0, bowlerMatchPlayerId },
  })
}

async function seatOpeners(server, token, inningsId, strikerMpId, nonStrikerMpId) {
  const s1 = await json(`${server.baseUrl}/innings/${inningsId}/state`, { token })
  await json(`${server.baseUrl}/innings/${inningsId}/events`, {
    method: 'POST',
    token,
    body: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: strikerMpId }, expectedVersion: s1.data.innings.version, clientActionId: randomUUID() },
  })
  const s2 = await json(`${server.baseUrl}/innings/${inningsId}/state`, { token })
  await json(`${server.baseUrl}/innings/${inningsId}/events`, {
    method: 'POST',
    token,
    body: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: nonStrikerMpId }, expectedVersion: s2.data.innings.version, clientActionId: randomUUID() },
  })
}

test('END-TO-END: Ground Owner creates match -> Umpire discovers/applies/scores -> completion revokes access -> finalize -> feedback -> ratings update', async () => {
  const server = await startTestApp()

  // --- Setup: ground + owner, 2 teams of 2 players each (minimum playing XI
  // for a real match), an approved umpire.
  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,'E2E Ground','ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `e2e-ground-${Date.now()}`,
    ])
  ).rows[0]
  const owner = await makeUser({ label: 'e2e-owner' })
  await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  await elevate(owner)

  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('E2E Team A','E2A') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('E2E Team B','E2B') RETURNING *`)).rows[0]
  const playerA1 = await createPlayer({ name: 'E2E A1', teamId: teamA.id, role: 'Batter' })
  const playerA2 = await createPlayer({ name: 'E2E A2', teamId: teamA.id, role: 'Batter' })
  const playerB1 = await createPlayer({ name: 'E2E B1', teamId: teamB.id, role: 'Bowler' })
  const playerB2 = await createPlayer({ name: 'E2E B2', teamId: teamB.id, role: 'Bowler' })

  const participantUser = await makeUser({ label: 'e2e-participant' })
  await pool.query('UPDATE players SET user_id = $1 WHERE id = $2', [participantUser.id, playerA1.id])

  const umpire = await approvedUmpire('e2e-umpire')

  let matchId, innings1Id, innings2Id

  try {
    // ------------------------------------------------------------------
    // 1. GROUND OWNER creates the match -> required umpire slot created
    // ------------------------------------------------------------------
    const created = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teamA.id, teamBId: teamB.id, matchDate: new Date(Date.now() + 3600000).toISOString(), requiredUmpires: 1, oversPerInnings: 1, ballsPerOver: 6 },
    })
    assert.equal(created.status, 201, JSON.stringify(created.data))
    matchId = created.data.match.id
    assert.equal(created.data.match.ground_id, ground.id, 'match must carry the real, server-derived ground_id')

    const slotsAfterCreate = await pool.query('SELECT * FROM match_umpire_slots WHERE match_id = $1', [matchId])
    assert.equal(slotsAfterCreate.rows.length, 1, 'exactly one AVAILABLE slot must exist, matching requiredUmpires')
    assert.equal(slotsAfterCreate.rows[0].status, 'AVAILABLE')

    // ------------------------------------------------------------------
    // 2. APPROVED UMPIRE discovers the match
    // ------------------------------------------------------------------
    const available = await json(`${server.baseUrl}/umpire/matches/available`, { token: umpire.token })
    assert.equal(available.status, 200)
    assert.ok(available.data.matches.some((m) => m.id === matchId), 'the new match must be discoverable by an approved umpire')

    // ------------------------------------------------------------------
    // 3. UMPIRE applies -> slot assigned
    // ------------------------------------------------------------------
    const applied = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    assert.equal(applied.data.slot.status, 'ASSIGNED')

    const slotsAfterApply = await pool.query('SELECT status, umpire_user_id FROM match_umpire_slots WHERE match_id = $1', [matchId])
    assert.equal(slotsAfterApply.rows[0].status, 'ASSIGNED')
    assert.equal(slotsAfterApply.rows[0].umpire_user_id, umpire.id)

    // ------------------------------------------------------------------
    // 4. GROUND OWNER + UMPIRE both notified
    // ------------------------------------------------------------------
    const ownerNotifs = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_SLOT_ASSIGNED'`, [owner.id])
    assert.equal(ownerNotifs.rows.length, 1, 'ground owner must receive a real UMPIRE_SLOT_ASSIGNED notification')
    assert.equal(ownerNotifs.rows[0].related_match_id, matchId)
    const umpireNotifs = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_SLOT_ASSIGNED'`, [umpire.id])
    assert.equal(umpireNotifs.rows.length, 1, 'umpire must receive a real UMPIRE_SLOT_ASSIGNED notification')

    // Ground owner dashboard reflects the fill in real time.
    const ownerMatches = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches`, { cookie: owner.cookie })
    const ownerMatchEntry = ownerMatches.data.matches.find((m) => m.id === matchId)
    assert.equal(ownerMatchEntry.filled_slots, 1)
    assert.equal(ownerMatchEntry.total_slots, 1)

    // ------------------------------------------------------------------
    // 5. Roster + toss + start, all performed by the ASSIGNED UMPIRE via
    //    the real match-scoped authorization boundary (requireMatchScorer)
    //    — not super_admin, not the ground owner.
    // ------------------------------------------------------------------
    const seatA1 = await json(`${server.baseUrl}/matches/${matchId}/match-players`, {
      method: 'POST',
      token: umpire.token,
      body: { teamId: teamA.id, playerId: playerA1.id, isPlayingXi: true },
    })
    assert.equal(seatA1.status, 201, JSON.stringify(seatA1.data))
    const seatA2 = await json(`${server.baseUrl}/matches/${matchId}/match-players`, {
      method: 'POST',
      token: umpire.token,
      body: { teamId: teamA.id, playerId: playerA2.id, isPlayingXi: true },
    })
    const seatB1 = await json(`${server.baseUrl}/matches/${matchId}/match-players`, {
      method: 'POST',
      token: umpire.token,
      body: { teamId: teamB.id, playerId: playerB1.id, isPlayingXi: true },
    })
    const seatB2 = await json(`${server.baseUrl}/matches/${matchId}/match-players`, {
      method: 'POST',
      token: umpire.token,
      body: { teamId: teamB.id, playerId: playerB2.id, isPlayingXi: true },
    })
    const mpA1 = seatA1.data.matchPlayer.id
    const mpA2 = seatA2.data.matchPlayer.id
    const mpB1 = seatB1.data.matchPlayer.id
    const mpB2 = seatB2.data.matchPlayer.id

    const toss = await json(`${server.baseUrl}/matches/${matchId}/toss`, {
      method: 'PATCH',
      token: umpire.token,
      body: { tossWinnerId: teamA.id, tossDecision: 'bat' },
    })
    assert.equal(toss.status, 200, JSON.stringify(toss.data))

    const started = await json(`${server.baseUrl}/matches/${matchId}/start`, { method: 'POST', token: umpire.token })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')

    // ------------------------------------------------------------------
    // 6. ASSIGNED UMPIRE scores the match for real — two full 1-over
    //    innings via genuine deliveries, not a status shortcut.
    // ------------------------------------------------------------------
    const innings1 = await json(`${server.baseUrl}/matches/${matchId}/innings`, {
      method: 'POST',
      token: umpire.token,
      body: { inningsNumber: 1, battingTeamId: teamA.id, bowlingTeamId: teamB.id },
    })
    assert.equal(innings1.status, 201, JSON.stringify(innings1.data))
    innings1Id = innings1.data.innings.id

    await seatOpeners(server, umpire.token, innings1Id, mpA1, mpA2)
    for (let i = 0; i < 6; i++) {
      const d = await bowlDotBall(server, umpire.token, innings1Id, mpB1)
      assert.equal(d.status, 201, `delivery ${i} must be accepted from the assigned umpire: ${JSON.stringify(d.data)}`)
    }

    const innings1State = await json(`${server.baseUrl}/innings/${innings1Id}/state`, { token: umpire.token })
    assert.equal(innings1State.data.innings.status, 'completed', 'innings 1 must complete after a full over with no wicket')

    const innings2 = await json(`${server.baseUrl}/matches/${matchId}/innings`, {
      method: 'POST',
      token: umpire.token,
      body: { inningsNumber: 2, battingTeamId: teamB.id, bowlingTeamId: teamA.id },
    })
    assert.equal(innings2.status, 201, JSON.stringify(innings2.data))
    innings2Id = innings2.data.innings.id

    await seatOpeners(server, umpire.token, innings2Id, mpB1, mpB2)
    for (let i = 0; i < 6; i++) {
      const d = await bowlDotBall(server, umpire.token, innings2Id, mpA1)
      assert.equal(d.status, 201, `delivery ${i} of innings 2 must be accepted: ${JSON.stringify(d.data)}`)
    }

    const matchAfterInnings2 = await json(`${server.baseUrl}/matches/${matchId}`, { token: umpire.token })
    assert.equal(matchAfterInnings2.data.match.status, 'completed', 'the match must reach completed automatically once both innings finish')

    // ------------------------------------------------------------------
    // 7. SCORING ACCESS REVOKED the moment the match is completed — the
    //    same umpire who just legitimately scored this match can no
    //    longer perform a normal scoring mutation on it.
    // ------------------------------------------------------------------
    const blockedRoster = await json(`${server.baseUrl}/matches/${matchId}/match-players`, {
      method: 'POST',
      token: umpire.token,
      body: { teamId: teamA.id, playerId: playerA1.id, isPlayingXi: true },
    })
    assert.equal(blockedRoster.status, 403, 'a normal scoring mutation must be denied once the match is completed')

    // ------------------------------------------------------------------
    // 8. FINALIZE — the one deliberate exception (U3.1): the assigned
    //    umpire may still finalize a completed match themselves.
    // ------------------------------------------------------------------
    const finalized = await json(`${server.baseUrl}/matches/${matchId}/finalize`, { method: 'POST', token: umpire.token })
    assert.equal(finalized.status, 200, JSON.stringify(finalized.data))
    assert.equal(finalized.data.match.status, 'finalized')

    // ------------------------------------------------------------------
    // 9. FEEDBACK becomes available — participant reviews Ground + Umpire
    //    + LOC in one submission.
    // ------------------------------------------------------------------
    const feedbackContext = await json(`${server.baseUrl}/matches/${matchId}/feedback`, { token: participantUser.token })
    assert.equal(feedbackContext.status, 200)
    assert.equal(feedbackContext.data.available, true)
    assert.equal(feedbackContext.data.eligible, true)
    assert.deepEqual(feedbackContext.data.categories, { ground: true, umpire: true, app: true })
    assert.equal(feedbackContext.data.ratableUmpires.length, 1)
    assert.equal(feedbackContext.data.ratableUmpires[0].userId, umpire.id)

    const submitted = await json(`${server.baseUrl}/matches/${matchId}/feedback`, {
      method: 'POST',
      token: participantUser.token,
      body: {
        groundRating: 5,
        groundCommentLiked: 'Great outfield',
        appRating: 4,
        umpireRatings: [{ umpireUserId: umpire.id, rating: 5, commentLiked: 'Fair and confident decisions' }],
      },
    })
    assert.equal(submitted.status, 201, JSON.stringify(submitted.data))

    // ------------------------------------------------------------------
    // 10. RATINGS RECALCULATED — both the ground and the umpire.
    // ------------------------------------------------------------------
    const groundAfter = await pool.query('SELECT rating_avg, rating_count FROM grounds WHERE id = $1', [ground.id])
    assert.equal(Number(groundAfter.rows[0].rating_avg), 5)
    assert.equal(groundAfter.rows[0].rating_count, 1)

    const umpireAfter = await pool.query('SELECT rating_avg, rating_count FROM umpire_profiles WHERE user_id = $1', [umpire.id])
    assert.equal(Number(umpireAfter.rows[0].rating_avg), 5)
    assert.equal(umpireAfter.rows[0].rating_count, 1)

    // The umpire profile API (U4) must surface the same real numbers.
    const umpireProfile = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(Number(umpireProfile.data.profile.rating_avg), 5)
    assert.equal(umpireProfile.data.profile.rating_count, 1)
    assert.equal(umpireProfile.data.profile.matches_officiated, 1, 'a completed/finalized match with an ASSIGNED slot must count as officiated')
  } finally {
    if (matchId) {
      await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE match_feedback_id IN (SELECT id FROM match_feedback WHERE match_id = $1)', [matchId])
      await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM commentary_entries WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM score_corrections WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1)', [matchId])
      await pool.query('DELETE FROM wagon_wheel_shots WHERE delivery_id IN (SELECT id FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1))', [matchId])
      await pool.query('DELETE FROM wickets WHERE delivery_id IN (SELECT id FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1))', [matchId])
      await pool.query('DELETE FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1)', [matchId])
      await pool.query('DELETE FROM match_events WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1)', [matchId])
      await pool.query('DELETE FROM innings WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM match_players WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id = $1', [matchId])
      await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
    }
    await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [umpire.id])
    await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [umpire.id])
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [owner.id])
    await pool.query('DELETE FROM ground_notifications WHERE user_id = ANY($1)', [[owner.id, umpire.id, participantUser.id]])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[owner.id, umpire.id, participantUser.id]])
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [[playerA1.id, playerA2.id, playerB1.id, playerB2.id]])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})
