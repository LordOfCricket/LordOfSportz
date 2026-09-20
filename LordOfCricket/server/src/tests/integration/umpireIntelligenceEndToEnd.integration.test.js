// Umpire Intelligence & Scale 2.0 — the two required end-to-end scenarios,
// real HTTP + real database, no faked state:
//
//  Ground Owner: create match (2 slots) -> several approved umpires, some
//  with conflicts/unavailability -> recommendation engine filters them ->
//  ranked candidates with reasons -> owner assigns via the EXISTING
//  apply/assign flow (never auto-assigned by the recommender itself) ->
//  match completes -> reputation updates -> a fresh recommendation call
//  reflects the new state.
//
//  Umpire: dashboard -> personal insights (trend) -> AI summary if
//  enabled (honestly NOT_CONFIGURED in this environment — no live API key
//  — proving the deterministic core never depends on AI being available).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { upsertWeeklyAvailability } from '../../models/umpireAvailability.model.js'
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
// the umpire intelligence end-to-end flow).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-intel-${label}-${uniqueTag()}@example.test`, role, playerType],
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
      await pool.query('DELETE FROM umpire_weekly_availability WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-intel-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_feedback WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'IEA') RETURNING *`, [`Intel E2E Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'IEB') RETURNING *`, [`Intel E2E Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('Ground Owner scenario — recommend, filter, rank, assign via the existing flow, complete, and see the recommendation reflect the new state', async () => {
  const server = await startTestApp()
  const gf = await createGround('e2e')
  const owner = await createUser('e2e-owner')
  const teams = await makeTeams()
  const conflictTeams = await makeTeams()
  const umpireA = await createUser('e2e-eligible-a', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireD = await createUser('e2e-eligible-d', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireConflict = await createUser('e2e-conflict', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireUnavailable = await createUser('e2e-unavailable', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  let conflictGf
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })

    const matchDate = new Date(Date.now() + 6 * 3600000) // 6h out
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: matchDate.toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 2,
    })

    // umpireConflict is already assigned to an overlapping match on another ground.
    conflictGf = await createGround('e2e-conflict-ground')
    await createMembership({ groundId: conflictGf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const conflictMatch = await matchService.createMatch({
      teamAId: conflictTeams.teamA.id,
      teamBId: conflictTeams.teamB.id,
      matchDate: matchDate.toISOString(),
      groundId: conflictGf.ground.id,
      requiredUmpires: 1,
    })
    await pool.query(`UPDATE match_umpire_slots SET status = 'ASSIGNED', umpire_user_id = $2, assigned_at = NOW() WHERE match_id = $1 AND slot_number = 1`, [
      conflictMatch.id,
      umpireConflict.id,
    ])
    await elevate(owner)

    // umpireUnavailable has marked themselves unavailable every day.
    for (let day = 0; day <= 6; day++) {
      // eslint-disable-next-line no-await-in-loop
      await upsertWeeklyAvailability(umpireUnavailable.id, day, false)
    }

    // Several approved umpires are available; recommendation engine filters conflicts/unavailability.
    const recommended = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires?limit=50`, {
      cookie: owner.cookie,
    })
    assert.equal(recommended.status, 200, JSON.stringify(recommended.data))
    const recommendedIds = recommended.data.candidates.map((c) => c.id)
    assert.ok(recommendedIds.includes(umpireA.id), 'an eligible umpire must be recommended')
    assert.ok(recommendedIds.includes(umpireD.id), 'a second eligible umpire must be recommended')
    assert.ok(!recommendedIds.includes(umpireConflict.id), 'a conflicting umpire must be filtered out')
    assert.ok(!recommendedIds.includes(umpireUnavailable.id), 'an unavailable umpire must be filtered out')

    // Ground Owner sees reasons (explainable, Workstream D).
    const entryA = recommended.data.candidates.find((c) => c.id === umpireA.id)
    assert.ok(entryA.reasons.length > 0)

    // Ground Owner chooses umpires through the EXISTING assignment flow — the
    // recommender itself never assigns anybody.
    const appliedA = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(appliedA.status, 201, JSON.stringify(appliedA.data))
    const appliedD = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireD.token })
    assert.equal(appliedD.status, 201, JSON.stringify(appliedD.data))

    // Both slots now filled — a fresh recommendation call for this exact
    // match must no longer offer either as a candidate (already assigned).
    const afterAssign = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires?limit=50`,
      { cookie: owner.cookie },
    )
    assert.equal(afterAssign.status, 200)
    const afterAssignIds = afterAssign.data.candidates.map((c) => c.id)
    assert.ok(!afterAssignIds.includes(umpireA.id))
    assert.ok(!afterAssignIds.includes(umpireD.id))

    // Match completes.
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    // Reputation updates — umpireA's own profile now reflects the real completion.
    const profileA = await json(`${server.baseUrl}/umpire/profile`, { token: umpireA.token })
    assert.equal(profileA.status, 200)
    assert.equal(profileA.data.profile.matches_officiated, 1)
    assert.equal(profileA.data.profile.reliability, 100)

    // A fresh recommendation call for a NEW match at the same ground reflects
    // the updated state — umpireA is recommendable again (no longer
    // conflicting with the now-completed match) and their reputation summary
    // shows the real, updated matchesOfficiated count.
    const secondMatch = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const secondRecommend = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${secondMatch.id}/recommended-umpires?limit=50`,
      { cookie: owner.cookie },
    )
    assert.equal(secondRecommend.status, 200)
    const entryAAgain = secondRecommend.data.candidates.find((c) => c.id === umpireA.id)
    assert.ok(entryAAgain, 'umpire A must be recommendable again for a new, non-conflicting match')
    assert.equal(entryAAgain.reputation.matchesOfficiated, 1, 'the recommendation data reflects the real, updated officiating count')
  } finally {
    await umpireA.cleanup()
    await umpireD.cleanup()
    await umpireConflict.cleanup()
    await umpireUnavailable.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    if (conflictGf) await conflictGf.cleanup()
    await teams.cleanup()
    await conflictTeams.cleanup()
    await server.close()
  }
})

test('Umpire scenario — dashboard, personal insights (trend), and an honest AI-unavailable state that never blocks the deterministic data', async () => {
  const server = await startTestApp()
  const umpire = await createUser('e2e-umpire-side', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    // Give the umpire a real completed match + rating.
    const { rows: matchRows } = await pool.query(
      `INSERT INTO matches (team_a_id, team_b_id, match_date, status) VALUES ($1,$2,NOW() - INTERVAL '1 day','completed') RETURNING id`,
      [teams.teamA.id, teams.teamB.id],
    )
    const matchId = matchRows[0].id
    const { rows: slotRows } = await pool.query(
      `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, completed_at) VALUES ($1,1,'COMPLETED',$2,NOW()) RETURNING id`,
      [matchId, umpire.id],
    )
    await pool.query(`INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type) VALUES ($1,$2,$3,'COMPLETED')`, [
      slotRows[0].id,
      matchId,
      umpire.id,
    ])

    // Dashboard (self profile) — reflects real data.
    const profile = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(profile.status, 200)
    assert.equal(profile.data.profile.matches_officiated, 1)

    // Personal insights — the real monthly trend.
    const trend = await json(`${server.baseUrl}/umpire/statistics/trend?months=3`, { token: umpire.token })
    assert.equal(trend.status, 200)
    assert.equal(trend.data.months.length, 3)
    const thisMonth = trend.data.months[trend.data.months.length - 1]
    assert.equal(thisMonth.matchesOfficiated, 1)

    // AI summary — honestly NOT_CONFIGURED in this environment (no live AI
    // API key), proving the deterministic data above never depends on it.
    const insight = await json(`${server.baseUrl}/umpire/ai-insight`, { token: umpire.token })
    assert.equal(insight.status, 200, 'the AI endpoint itself must never error out, even when unconfigured')
    assert.equal(insight.data.available, false)
    assert.equal(insight.data.reason, 'NOT_CONFIGURED')

    await pool.query('DELETE FROM umpire_assignment_events WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
    await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
