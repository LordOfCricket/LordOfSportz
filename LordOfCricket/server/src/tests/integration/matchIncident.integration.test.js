// Incident reporting (Phase 23, Workstream I) — the assigned umpire can
// record a match incident (fixed taxonomy), visible to themselves and the
// match's ground owner. Not a generic issue tracker. Real HTTP against the
// real app, same pattern as every other integration test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
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
// incident reporting).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-incident-${label}-${uniqueTag()}@example.test`, role, playerType],
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
    `integration-test-incident-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_incidents WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'INA') RETURNING *`, [`Incident Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'INB') RETURNING *`, [`Incident Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('the assigned umpire can report an incident; the ground owner sees it and gets notified; an unassigned player cannot report', async () => {
  const server = await startTestApp()
  const gf = await createGround('report')
  const owner = await createUser('report-owner')
  const umpire = await createUser('report-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const stranger = await createUser('report-stranger', { playerType: 'umpire', umpireRequestStatus: 'approved' })
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
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const rejected = await json(`${server.baseUrl}/matches/${match.id}/incidents`, {
      method: 'POST',
      token: stranger.token,
      body: { incidentType: 'RAIN', description: 'Heavy rain.' },
    })
    assert.equal(rejected.status, 403)

    const reported = await json(`${server.baseUrl}/matches/${match.id}/incidents`, {
      method: 'POST',
      token: umpire.token,
      body: { incidentType: 'RAIN', description: 'Heavy rain started at 8:12 PM.' },
    })
    assert.equal(reported.status, 201, JSON.stringify(reported.data))
    assert.equal(reported.data.incident.incident_type, 'RAIN')
    assert.equal(reported.data.incident.description, 'Heavy rain started at 8:12 PM.')

    const notified = await pool.query(`SELECT ground_id FROM ground_notifications WHERE user_id = $1 AND type = 'MATCH_INCIDENT_REPORTED'`, [
      owner.id,
    ])
    assert.equal(notified.rows.length, 1)
    // Phase 2 Cleanup — groundId lets NotificationBell deep-link the owner
    // into their own ground's Matches tab (TYPE_ROUTE_SUFFIX), scoped to
    // this incident's real, own ground only — never another ground's.
    assert.equal(notified.rows[0].ground_id, gf.ground.id, "the owner's notification must carry this match's real ground id")

    const asUmpire = await json(`${server.baseUrl}/matches/${match.id}/incidents`, { token: umpire.token })
    assert.equal(asUmpire.status, 200)
    assert.equal(asUmpire.data.incidents.length, 1)

    const asOwner = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/incidents`, {
      cookie: owner.cookie,
    })
    assert.equal(asOwner.status, 200)
    assert.equal(asOwner.data.incidents.length, 1)
    assert.equal(asOwner.data.incidents[0].reported_by_name, 'Integration Test report-umpire')
  } finally {
    await stranger.cleanup()
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('an invalid incidentType is rejected with 400', async () => {
  const server = await startTestApp()
  const gf = await createGround('invalid')
  const umpire = await createUser('invalid-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const res = await json(`${server.baseUrl}/matches/${match.id}/incidents`, {
      method: 'POST',
      token: umpire.token,
      body: { incidentType: 'ZOMBIE_ATTACK' },
    })
    assert.equal(res.status, 400)
  } finally {
    await umpire.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
