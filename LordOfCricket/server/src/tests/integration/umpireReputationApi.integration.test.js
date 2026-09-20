// Umpire Reputation & Trust 2.0 — HTTP-level exposure of the shared
// reputation summary across its 3 consumer endpoints: self profile
// (GET /umpire/profile), ground-owner assigned-umpire view
// (GET /ground-owner/.../umpire-slots), and the replacement candidate
// picker (GET /ground-owner/.../eligible-replacements). Real HTTP against
// the real app, same pattern as every other integration test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'
import * as matchService from '../../services/match.service.js'

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
// the reputation-batching API).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-repapi-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-repapi-ground-${label}-${uniqueTag()}`,
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
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RAA') RETURNING *`, [`RepApi Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RAB') RETURNING *`, [`RepApi Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('GET /umpire/profile exposes verified/experienceYears/badges/recentRatings for a brand-new approved umpire honestly', async () => {
  const server = await startTestApp()
  const umpire = await createUser('self-new', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const res = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const p = res.data.profile
    assert.equal(p.verified, true)
    assert.equal(p.experienceYears, 0, 'approved moments ago -> under a year')
    assert.deepEqual(p.badges, [])
    assert.deepEqual(p.recentRatings, [])
    // Privacy — no phone/email/private availability ever leaks into this response.
    assert.equal(p.email, undefined)
    assert.equal(p.phone, undefined)
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('GET /umpire/profile: a pending (unapproved) umpire is never verified', async () => {
  const server = await startTestApp()
  const umpire = await createUser('self-pending', { playerType: 'umpire', umpireRequestStatus: 'pending' })
  try {
    const res = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(res.status, 403, 'a pending umpire is not even an approved umpire yet — denied by the existing requireApprovedUmpire gate, unchanged')
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('GET /ground-owner/.../umpire-slots and .../eligible-replacements both expose a batched reputation object, with no phone/email/availability leak', async () => {
  const server = await startTestApp()
  const gf = await createGround('slots')
  const owner = await createUser('slots-owner')
  const umpireA = await createUser('slots-umpire-a', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireB = await createUser('slots-umpire-b', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  let matchId
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
    matchId = match.id
    const applied = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    const slotId = applied.data.slot.id

    const slots = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/umpire-slots`, { cookie: owner.cookie })
    assert.equal(slots.status, 200)
    const assignedSlot = slots.data.slots.find((s) => s.id === slotId)
    assert.ok(assignedSlot.reputation, 'an ASSIGNED slot must carry a reputation summary for its umpire')
    assert.equal(assignedSlot.reputation.userId, umpireA.id)
    assert.equal(assignedSlot.reputation.verified, true)
    assert.equal(assignedSlot.reputation.email, undefined)
    assert.equal(assignedSlot.reputation.phone, undefined)

    // Mark A a no-show, then check the eligible-replacements list for B's reputation.
    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    const eligible = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/eligible-replacements`,
      { cookie: owner.cookie },
    )
    assert.equal(eligible.status, 200)
    const candidateB = eligible.data.candidates.find((c) => c.id === umpireB.id)
    assert.ok(candidateB, 'umpire B must still be listed as an eligible candidate')
    assert.ok(candidateB.reputation, 'each candidate must carry a reputation summary')
    assert.equal(candidateB.reputation.verified, true)
    assert.equal(candidateB.reputation.email, undefined)
  } finally {
    if (matchId) {
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id = $1', [matchId])
      await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
    }
    await umpireA.cleanup()
    await umpireB.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
