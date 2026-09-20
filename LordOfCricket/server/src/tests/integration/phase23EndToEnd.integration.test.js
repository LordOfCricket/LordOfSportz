// Phase 23 — Umpire Operations 2.0 end-to-end scenarios. Both go through the
// real HTTP app with real authorization, same posture as
// endToEndUmpireNetwork.integration.test.js (U8) — including real
// ball-by-ball scoring for Scenario 1's auto-completion path, so this
// genuinely proves the new operational layer (availability, check-in,
// incidents, no-show, replacement, reliability) works together with the
// existing U1-U10 foundation, not just in isolation.
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
// the Phase 23 operational end-to-end flow).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-p23e2e-${label}-${uniqueTag()}@example.test`, role, playerType],
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

async function seatPlayer(server, token, matchId, teamId, playerId) {
  const res = await json(`${server.baseUrl}/matches/${matchId}/match-players`, { method: 'POST', token, body: { teamId, playerId, isPlayingXi: true } })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  return res.data.matchPlayer.id
}

function cleanupMatchRows(matchId) {
  return (async () => {
    await pool.query('DELETE FROM match_incidents WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM umpire_match_checklist_items WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM umpire_assignment_events WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM commentary_entries WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM wagon_wheel_shots WHERE delivery_id IN (SELECT id FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1))', [matchId])
    await pool.query('DELETE FROM wickets WHERE delivery_id IN (SELECT id FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1))', [matchId])
    await pool.query('DELETE FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1)', [matchId])
    await pool.query('DELETE FROM match_events WHERE innings_id IN (SELECT id FROM innings WHERE match_id = $1)', [matchId])
    await pool.query('DELETE FROM innings WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM match_players WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM ground_notifications WHERE related_match_id = $1', [matchId])
    await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
  })()
}

// Phase 8 — NEW finding (not one of the 16 previously-documented pre-
// existing failures), root-caused, not fixed here. FOUND: `matches.
// match_date` is `TIMESTAMP WITHOUT TIME ZONE` (confirmed via information_
// schema), and this Postgres server's session timezone is `Asia/Calcutta`
// (confirmed via `SHOW TIMEZONE`) — inserting a UTC instant into that
// column type, under that session timezone, silently shifts it by -5:30
// (reproduced directly: inserting match_date='2026-08-17T04:16:35.517Z'
// and reading it straight back via INSERT...RETURNING yielded
// '2026-08-16T22:46:35.517Z' — a different CALENDAR DAY). This scenario's
// step 2/3 (umpire B marks a UTC calendar date unavailable, matching the
// domain layer's own UTC-based date math — see domain/umpireAssignment/
// availability.js's own comment) sits right at that boundary, so the
// stored match_date's shifted calendar day no longer matches the
// override's date, and the NOT_AVAILABLE gate is silently skipped (201
// instead of the expected 409). Confirmed via direct reproduction this
// is NOT caused by anything in Phase 8 (or Phase 6/7) — verified the
// domain/model layer (isUmpireAvailableForMatch, specific_date::text
// casting) is already correct in isolation; the bug is purely the
// column-type + session-timezone interaction.
// DEFERRED (not fixed this phase): the low-risk fix is forcing the pool's
// session timezone to UTC (matches every other UTC assumption already
// throughout this codebase), but this is a SHARED dev database with
// pre-existing rows already written under the current (buggy) timezone
// interpretation — flipping session timezone now would change how THOSE
// existing rows are read back, not just new ones. That needs a proper
// audit of every TIMESTAMP WITHOUT TIME ZONE column plus a backfill
// decision, not a same-phase blind fix. Documented in the Phase 8 report
// as a real, deferred finding — not silently accepted as "flaky."
test('SCENARIO 1: Ground Owner creates match with 2 umpire slots -> A available/assigned, B unavailable -> A checks in -> owner starts understaffed -> A scores + reports an incident -> match auto-completes -> A gets officiating credit -> feedback + reliability reflect it', async () => {
  const server = await startTestApp()

  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,'P23E2E Ground 1','ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `p23e2e-ground-1-${uniqueTag()}`,
    ])
  ).rows[0]
  const owner = await makeUser({ label: 's1-owner' })
  await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  await elevate(owner)

  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('P23E2E A1','P2A1') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('P23E2E B1','P2B1') RETURNING *`)).rows[0]
  const playerA1 = await createPlayer({ name: 'P23 A1', teamId: teamA.id, role: 'Batter' })
  const playerA2 = await createPlayer({ name: 'P23 A2', teamId: teamA.id, role: 'Batter' })
  const playerB1 = await createPlayer({ name: 'P23 B1', teamId: teamB.id, role: 'Bowler' })
  const playerB2 = await createPlayer({ name: 'P23 B2', teamId: teamB.id, role: 'Bowler' })

  const participant = await makeUser({ label: 's1-participant' })
  await pool.query('UPDATE players SET user_id = $1 WHERE id = $2', [participant.id, playerA1.id])

  const umpireA = await approvedUmpire('s1-umpire-a')
  const umpireB = await approvedUmpire('s1-umpire-b')

  let matchId
  try {
    // 1. Ground Owner creates a match requiring 2 umpires.
    const matchDate = new Date(Date.now() + 3600000).toISOString()
    const created = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teamA.id, teamBId: teamB.id, matchDate, requiredUmpires: 2, oversPerInnings: 1, ballsPerOver: 6 },
    })
    assert.equal(created.status, 201, JSON.stringify(created.data))
    matchId = created.data.match.id

    // 2. Umpire B marks themselves unavailable for the match's whole day.
    const matchDateStr = matchDate.slice(0, 10)
    const unavailable = await json(`${server.baseUrl}/umpire/availability/date`, {
      method: 'PATCH',
      token: umpireB.token,
      body: { date: matchDateStr, isAvailable: false },
    })
    assert.equal(unavailable.status, 200, JSON.stringify(unavailable.data))

    // 3. Umpire A applies successfully; Umpire B's application is blocked by
    //    the new availability gate.
    const appliedA = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(appliedA.status, 201, JSON.stringify(appliedA.data))

    const appliedB = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpireB.token })
    assert.equal(appliedB.status, 409, JSON.stringify(appliedB.data))
    assert.equal(appliedB.data.code, 'NOT_AVAILABLE')

    const slots = await pool.query('SELECT status FROM match_umpire_slots WHERE match_id = $1 ORDER BY slot_number', [matchId])
    assert.deepEqual(slots.rows.map((r) => r.status), ['ASSIGNED', 'AVAILABLE'], 'only one of the two slots is filled')

    // 4. Umpire A checks in.
    const checkIn = await json(`${server.baseUrl}/matches/${matchId}/checkin`, { method: 'POST', token: umpireA.token, body: { latitude: 1, longitude: 1 } })
    assert.equal(checkIn.status, 200, JSON.stringify(checkIn.data))
    assert.ok(checkIn.data.slot.checked_in_at)

    // 5. Roster + toss, then Ground Owner starts the match UNDERSTAFFED
    //    (1 of 2 umpire slots filled) — the existing U9 confirm-override.
    const mpA1 = await seatPlayer(server, umpireA.token, matchId, teamA.id, playerA1.id)
    const mpA2 = await seatPlayer(server, umpireA.token, matchId, teamA.id, playerA2.id)
    const mpB1 = await seatPlayer(server, umpireA.token, matchId, teamB.id, playerB1.id)
    const mpB2 = await seatPlayer(server, umpireA.token, matchId, teamB.id, playerB2.id)

    const toss = await json(`${server.baseUrl}/matches/${matchId}/toss`, { method: 'PATCH', token: umpireA.token, body: { tossWinnerId: teamA.id, tossDecision: 'bat' } })
    assert.equal(toss.status, 200, JSON.stringify(toss.data))

    const blockedStart = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/start`, { method: 'POST', cookie: owner.cookie })
    assert.equal(blockedStart.status, 409, JSON.stringify(blockedStart.data))
    assert.equal(blockedStart.data.details?.understaffed, true)

    const started = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/start`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { confirmUnderstaffed: true },
    })
    assert.equal(started.status, 200, JSON.stringify(started.data))
    assert.equal(started.data.match.status, 'live')

    // 6. Umpire A reports an incident mid-match.
    const incident = await json(`${server.baseUrl}/matches/${matchId}/incidents`, {
      method: 'POST',
      token: umpireA.token,
      body: { incidentType: 'BAD_LIGHT', description: 'Floodlights flickering in the 2nd over.' },
    })
    assert.equal(incident.status, 201, JSON.stringify(incident.data))
    const ownerIncidentNotif = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'MATCH_INCIDENT_REPORTED'`, [owner.id])
    assert.equal(ownerIncidentNotif.rows[0].n, 1)

    // 7. Umpire A scores both innings for real (1-over each) — the match
    //    auto-completes via the scoring engine (maybeCompleteInnings).
    const innings1 = await json(`${server.baseUrl}/matches/${matchId}/innings`, { method: 'POST', token: umpireA.token, body: { inningsNumber: 1, battingTeamId: teamA.id, bowlingTeamId: teamB.id } })
    assert.equal(innings1.status, 201, JSON.stringify(innings1.data))
    await seatOpeners(server, umpireA.token, innings1.data.innings.id, mpA1, mpA2)
    for (let i = 0; i < 6; i++) {
      const d = await bowlDotBall(server, umpireA.token, innings1.data.innings.id, mpB1)
      assert.equal(d.status, 201, JSON.stringify(d.data))
    }

    const innings2 = await json(`${server.baseUrl}/matches/${matchId}/innings`, { method: 'POST', token: umpireA.token, body: { inningsNumber: 2, battingTeamId: teamB.id, bowlingTeamId: teamA.id } })
    assert.equal(innings2.status, 201, JSON.stringify(innings2.data))
    await seatOpeners(server, umpireA.token, innings2.data.innings.id, mpB1, mpB2)
    for (let i = 0; i < 6; i++) {
      await bowlDotBall(server, umpireA.token, innings2.data.innings.id, mpA1)
    }

    const matchAfter = await json(`${server.baseUrl}/matches/${matchId}`, { token: umpireA.token })
    assert.equal(matchAfter.data.match.status, 'completed', 'the match must auto-complete once both innings finish')

    // 8. Umpire A's slot transitioned ASSIGNED -> COMPLETED (officiating
    //    credit) in the SAME transaction as the match completing.
    const slotAfter = await pool.query('SELECT status FROM match_umpire_slots WHERE match_id = $1 AND umpire_user_id = $2', [matchId, umpireA.id])
    assert.equal(slotAfter.rows[0].status, 'COMPLETED')

    // 9. Feedback remains available and eligible for the participant.
    const feedbackContext = await json(`${server.baseUrl}/matches/${matchId}/feedback`, { token: participant.token })
    assert.equal(feedbackContext.status, 200)
    assert.equal(feedbackContext.data.available, true)
    assert.equal(feedbackContext.data.ratableUmpires.length, 1, 'the COMPLETED umpire slot must still be ratable — this is the exact fix for the ASSIGNED-only eligibility gap')
    assert.equal(feedbackContext.data.ratableUmpires[0].userId, umpireA.id)

    // 10. Reliability/statistics updated for Umpire A: 1 officiated, 0
    //     no-shows, 0 cancellations -> 100% reliability.
    const profileA = await json(`${server.baseUrl}/umpire/profile`, { token: umpireA.token })
    assert.equal(profileA.data.profile.matches_officiated, 1)
    assert.equal(profileA.data.profile.matches_no_show, 0)
    assert.equal(profileA.data.profile.reliability, 100)
  } finally {
    if (matchId) await cleanupMatchRows(matchId)
    await pool.query('DELETE FROM umpire_date_availability WHERE umpire_user_id = ANY($1)', [[umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM umpire_profiles WHERE user_id = ANY($1)', [[umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM umpire_requests WHERE user_id = ANY($1)', [[umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE match_feedback_id IN (SELECT id FROM match_feedback WHERE match_id = $1)', [matchId])
    await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [owner.id])
    await pool.query('DELETE FROM ground_notifications WHERE user_id = ANY($1)', [[owner.id, umpireA.id, umpireB.id, participant.id]])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[owner.id, umpireA.id, umpireB.id, participant.id]])
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [[playerA1.id, playerA2.id, playerB1.id, playerB2.id]])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('SCENARIO 2: Umpire A assigned -> no-show -> Ground Owner finds + assigns replacement Umpire B -> B gets scoring access, A does not -> match completes manually -> B gets officiating credit, A does not', async () => {
  const server = await startTestApp()

  const ground = (
    await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,'P23E2E Ground 2','ACTIVE') RETURNING *`, [
      generatePublicId('GRD', 8),
      `p23e2e-ground-2-${uniqueTag()}`,
    ])
  ).rows[0]
  const owner = await makeUser({ label: 's2-owner' })
  await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  await elevate(owner)

  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('P23E2E A2','P2A2') RETURNING *`)).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ('P23E2E B2','P2B2') RETURNING *`)).rows[0]
  const playerA1 = await createPlayer({ name: 'P23s2 A1', teamId: teamA.id, role: 'Batter' })
  const playerA2 = await createPlayer({ name: 'P23s2 A2', teamId: teamA.id, role: 'Batter' })
  const playerB1 = await createPlayer({ name: 'P23s2 B1', teamId: teamB.id, role: 'Bowler' })
  const playerB2 = await createPlayer({ name: 'P23s2 B2', teamId: teamB.id, role: 'Bowler' })

  const umpireA = await approvedUmpire('s2-umpire-a')
  const umpireB = await approvedUmpire('s2-umpire-b')

  let matchId
  try {
    // 1. Umpire A is assigned to a match requiring 1 umpire.
    const created = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { teamAId: teamA.id, teamBId: teamB.id, matchDate: new Date(Date.now() + 3600000).toISOString(), requiredUmpires: 1, oversPerInnings: 1, ballsPerOver: 6 },
    })
    assert.equal(created.status, 201, JSON.stringify(created.data))
    matchId = created.data.match.id

    const appliedA = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(appliedA.status, 201, JSON.stringify(appliedA.data))
    const slotId = appliedA.data.slot.id

    await seatPlayer(server, umpireA.token, matchId, teamA.id, playerA1.id)
    await seatPlayer(server, umpireA.token, matchId, teamA.id, playerA2.id)
    await seatPlayer(server, umpireA.token, matchId, teamB.id, playerB1.id)
    await seatPlayer(server, umpireA.token, matchId, teamB.id, playerB2.id)

    // 2. Ground Owner marks Umpire A a NO_SHOW.
    const noShow = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(noShow.status, 200, JSON.stringify(noShow.data))
    assert.equal(noShow.data.slot.status, 'NO_SHOW')

    // 3. Ground Owner finds eligible replacements -> Umpire B is listed.
    const eligible = await json(
      `${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/eligible-replacements`,
      { cookie: owner.cookie },
    )
    assert.equal(eligible.status, 200, JSON.stringify(eligible.data))
    assert.ok(eligible.data.candidates.some((c) => c.id === umpireB.id))

    // 4. Ground Owner assigns Umpire B as the replacement.
    const replaced = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/replace`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { newUmpireUserId: umpireB.id },
    })
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data))
    assert.equal(replaced.data.slot.status, 'ASSIGNED')
    assert.equal(replaced.data.slot.umpire_user_id, umpireB.id)

    // 5. Umpire B (not A) now has scoring access — set the toss.
    const tossAsA = await json(`${server.baseUrl}/matches/${matchId}/toss`, { method: 'PATCH', token: umpireA.token, body: { tossWinnerId: teamA.id, tossDecision: 'bat' } })
    assert.equal(tossAsA.status, 403, 'the no-show umpire must no longer have scoring access')

    const tossAsB = await json(`${server.baseUrl}/matches/${matchId}/toss`, { method: 'PATCH', token: umpireB.token, body: { tossWinnerId: teamA.id, tossDecision: 'bat' } })
    assert.equal(tossAsB.status, 200, JSON.stringify(tossAsB.data))

    const startedAsB = await json(`${server.baseUrl}/matches/${matchId}/start`, { method: 'POST', token: umpireB.token })
    assert.equal(startedAsB.status, 200, JSON.stringify(startedAsB.data))

    // 6. Match completes MANUALLY (Ground Owner "Match is Over") — the
    //    OTHER completion hook (completeMatchManually), distinct from
    //    Scenario 1's auto-completion path.
    const completed = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(completed.status, 200, JSON.stringify(completed.data))
    assert.equal(completed.data.match.status, 'completed')

    // 7. Umpire B gets officiating credit; Umpire A does not.
    const profileB = await json(`${server.baseUrl}/umpire/profile`, { token: umpireB.token })
    assert.equal(profileB.data.profile.matches_officiated, 1)
    assert.equal(profileB.data.profile.matches_no_show, 0)

    const profileA = await json(`${server.baseUrl}/umpire/profile`, { token: umpireA.token })
    assert.equal(profileA.data.profile.matches_officiated, 0, 'the no-show umpire must never receive officiating credit for this match')
    assert.equal(profileA.data.profile.matches_no_show, 1)

    // 8. History preserves the full timeline on the same slot: A assigned,
    //    A no-show, B replacement-assigned, B completed.
    const history = await json(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/matches/${matchId}/umpire-history`, { cookie: owner.cookie })
    assert.equal(history.status, 200)
    const timeline = history.data.events.map((e) => ({ type: e.event_type, umpireId: e.umpire_user_id }))
    assert.deepEqual(timeline, [
      { type: 'ASSIGNED', umpireId: umpireA.id },
      { type: 'NO_SHOW', umpireId: umpireA.id },
      { type: 'REPLACEMENT_ASSIGNED', umpireId: umpireB.id },
      { type: 'COMPLETED', umpireId: umpireB.id },
    ])
  } finally {
    if (matchId) await cleanupMatchRows(matchId)
    await pool.query('DELETE FROM umpire_profiles WHERE user_id = ANY($1)', [[umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM umpire_requests WHERE user_id = ANY($1)', [[umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [owner.id])
    await pool.query('DELETE FROM ground_notifications WHERE user_id = ANY($1)', [[owner.id, umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [[owner.id, umpireA.id, umpireB.id]])
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [[playerA1.id, playerA2.id, playerB1.id, playerB2.id]])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})
