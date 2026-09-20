// Umpire Intelligence & Scale 2.0, Workstreams J/K — ground-level umpire
// operations summary + per-match staffing forecast. Real HTTP + real DB.
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

async function json(url, { method = 'GET', token, cookie } = {}) {
  const authHeaders = cookie ? { Cookie: cookie } : token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, { method, headers: authHeaders })
  return { status: res.status, data: await res.json() }
}

// Phase 6 — requireGroundPermission's GROUND_OWNER branch now requires
// req.mfaVerified. `elevate` mints a REAL, already-MFA-verified session
// cookie — see helpers/mfaFixtures.js (this file isn't testing MFA, only
// the operations summary).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label) {
  const { rows } = await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash','player') RETURNING *`, [
    `Integration Test ${label}`,
    `integration-test-opssum-${label}-${uniqueTag()}@example.test`,
  ])
  const user = rows[0]
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-opssum-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_feedback WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'OSA') RETURNING *`, [`Ops Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'OSB') RETURNING *`, [`Ops Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('umpire operations summary: matches this month, fully staffed, no-show count all reflect real data', async () => {
  const server = await startTestApp()
  const gf = await createGround('summary')
  const owner = await createUser('summary-owner')
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    // Match 1: fully staffed (1/1).
    const m1 = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    await pool.query(`UPDATE match_umpire_slots SET status = 'ASSIGNED', umpire_user_id = $2 WHERE match_id = $1`, [m1.id, owner.id])

    // Match 2: understaffed (0/1), still upcoming.
    await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    // Match 3: a recorded no-show event.
    const m3 = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const slot3 = (await pool.query(`SELECT id FROM match_umpire_slots WHERE match_id = $1`, [m3.id])).rows[0]
    await pool.query(`UPDATE match_umpire_slots SET status = 'NO_SHOW' WHERE id = $1`, [slot3.id])
    await pool.query(`INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type) VALUES ($1,$2,$3,'NO_SHOW')`, [
      slot3.id,
      m3.id,
      owner.id,
    ])

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/umpire-operations-summary`, { cookie: owner.cookie })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.summary.matchesThisMonth, 3)
    assert.equal(res.data.summary.fullyStaffed, 1)
    assert.equal(res.data.summary.currentlyUnderstaffedUpcoming, 2, 'match 2 (0/1) and match 3 (no-show, 0/1) are both understaffed and upcoming')
    assert.equal(res.data.summary.noShowCount, 1)
    assert.equal(res.data.summary.avgUmpireRating, null, 'below the minimum review sample — never a misleading average from near-zero reviews')
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('umpire operations summary is scoped to the owning Ground Owner and denied to others', async () => {
  const server = await startTestApp()
  const gf = await createGround('scope')
  const owner = await createUser('scope-owner')
  const outsider = await createUser('scope-outsider')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const denied = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/umpire-operations-summary`, { token: outsider.token })
    assert.equal(denied.status, 403)
    const noAuth = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/umpire-operations-summary`)
    assert.equal(noAuth.status, 401)
  } finally {
    await owner.cleanup()
    await outsider.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('staffing forecast is attached to each upcoming match in the ground-owner match list', async () => {
  const server = await startTestApp()
  const gf = await createGround('forecast')
  const owner = await createUser('forecast-owner')
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const soon = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 2 * 3600000).toISOString(), // 2h away, understaffed
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const later = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 48 * 3600000).toISOString(), // 2 days away, understaffed
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    const res = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches`, { cookie: owner.cookie })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const soonRow = res.data.matches.find((m) => m.id === soon.id)
    const laterRow = res.data.matches.find((m) => m.id === later.id)
    assert.equal(soonRow.staffingForecast.status, 'NEEDS_ATTENTION')
    assert.equal(laterRow.staffingForecast.status, 'OPEN')
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
