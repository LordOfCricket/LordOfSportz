// Umpire Intelligence & Scale 2.0 — the "Recommended Umpires" endpoint:
// eligibility filtering (approved/no-conflict/available), ranking, privacy,
// and ground-owner scoping. Real HTTP + real DB state.
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
// umpire recommendations).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-rec-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
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
    `integration-test-rec-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RCA') RETURNING *`, [`Rec Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RCB') RETURNING *`, [`Rec Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('only approved umpires appear — a pending umpire is never recommended', async () => {
  const server = await startTestApp()
  const gf = await createGround('approved-only')
  const owner = await createUser('approved-only-owner')
  const approved = await createUser('approved-only-approved', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const pending = await createUser('approved-only-pending', { playerType: 'umpire', umpireRequestStatus: 'pending' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    // limit=50 — the dev DB may already have other approved umpires who
    // legitimately outrank a brand-new test candidate; this test is about
    // presence/absence by approval status, not about ranking position, so
    // it must see the full eligible pool, not just the default top-5.
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires?limit=50`, {
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const ids = res.data.candidates.map((c) => c.id)
    assert.ok(ids.includes(approved.id))
    assert.ok(!ids.includes(pending.id), 'a pending umpire must never be recommended')
  } finally {
    await approved.cleanup()
    await pending.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a candidate with a conflicting match elsewhere is excluded from recommendations', async () => {
  const server = await startTestApp()
  const gf = await createGround('conflict')
  const owner = await createUser('conflict-owner')
  const candidate = await createUser('conflict-candidate', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  const otherTeams = await makeTeams()
  let otherGf
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const matchDate = new Date(Date.now() + 3 * 3600000)
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: matchDate.toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    // Candidate is already assigned to an overlapping match at the exact same time, on a different ground.
    otherGf = await createGround('conflict-other')
    await createMembership({ groundId: otherGf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const otherMatch = await matchService.createMatch({
      teamAId: otherTeams.teamA.id,
      teamBId: otherTeams.teamB.id,
      matchDate: matchDate.toISOString(),
      groundId: otherGf.ground.id,
      requiredUmpires: 1,
    })
    await pool.query(`UPDATE match_umpire_slots SET status = 'ASSIGNED', umpire_user_id = $2, assigned_at = NOW() WHERE match_id = $1 AND slot_number = 1`, [
      otherMatch.id,
      candidate.id,
    ])

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires`, {
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.ok(!res.data.candidates.some((c) => c.id === candidate.id), 'a candidate with a conflicting assignment must be excluded')
  } finally {
    await candidate.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    if (otherGf) await otherGf.cleanup()
    await teams.cleanup()
    await otherTeams.cleanup()
    await server.close()
  }
})

test('an umpire marked unavailable for the match day/time is excluded from recommendations', async () => {
  const server = await startTestApp()
  const gf = await createGround('unavailable')
  const owner = await createUser('unavailable-owner')
  const candidate = await createUser('unavailable-candidate', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const matchDate = new Date(Date.now() + 5 * 86400000) // 5 days out, so its weekday is stable within this test run
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: matchDate.toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    // Mark the candidate unavailable for every day of the week.
    for (let day = 0; day <= 6; day++) {
      // eslint-disable-next-line no-await-in-loop
      await upsertWeeklyAvailability(candidate.id, day, false)
    }

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires`, {
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.ok(!res.data.candidates.some((c) => c.id === candidate.id), 'an umpire unavailable for this day must be excluded')
  } finally {
    await candidate.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('recommendations include factual reasons and honestly flag limited data, never private fields', async () => {
  const server = await startTestApp()
  const gf = await createGround('reasons')
  const owner = await createUser('reasons-owner')
  const candidate = await createUser('reasons-candidate', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires?limit=50`, {
      cookie: owner.cookie,
    })
    assert.equal(res.status, 200)
    const entry = res.data.candidates.find((c) => c.id === candidate.id)
    assert.ok(entry)
    assert.ok(Array.isArray(entry.reasons) && entry.reasons.length > 0)
    assert.ok(entry.reasons.includes('New umpire — limited data yet'))
    assert.equal(entry.hasEnoughData, false)
    const raw = JSON.stringify(res.data)
    assert.ok(!raw.includes('@example.test'), 'no email must ever appear in a recommendation response')
  } finally {
    await candidate.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('recommendations are scoped to the owning Ground Owner\'s own match — a different owner gets a 404, not the data', async () => {
  const server = await startTestApp()
  const gf = await createGround('scoped')
  const owner = await createUser('scoped-owner')
  const otherOwner = await createUser('scoped-other-owner')
  const otherGf = await createGround('scoped-other')
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    await createMembership({ groundId: otherGf.ground.id, userId: otherOwner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    // Correctly-owned request succeeds.
    const ok = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires`, {
      cookie: owner.cookie,
    })
    assert.equal(ok.status, 200)

    // The other owner, hitting THEIR OWN ground's URL but with this match's id, cannot see it.
    await elevate(otherOwner)
    const crossGround = await json(
      `${server.baseUrl}/ground-owner/grounds/${otherGf.ground.public_ground_id}/matches/${match.id}/recommended-umpires`,
      { cookie: otherOwner.cookie },
    )
    assert.equal(crossGround.status, 404, 'a match must never be visible through a ground that does not own it')

    // An unauthenticated request is denied outright.
    const noAuth = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/recommended-umpires`)
    assert.equal(noAuth.status, 401)
  } finally {
    await owner.cleanup()
    await otherOwner.cleanup()
    await gf.cleanup()
    await otherGf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
