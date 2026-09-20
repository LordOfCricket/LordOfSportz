// Check-in (Phase 23, Workstream E) — POST /matches/:id/checkin, gated by
// the same requireMatchScorerByParam gate as toss/start (only the actively
// assigned umpire), idempotent (a second call never overwrites the original
// check-in time/location), optional lat/lng, notifies the ground owner only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
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

async function json(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json() }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-checkin-${label}-${uniqueTag()}@example.test`, role, playerType],
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
    `integration-test-checkin-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CIA') RETURNING *`, [`CheckIn Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CIB') RETURNING *`, [`CheckIn Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('the assigned umpire can check in with an optional location; a second check-in is idempotent and never overwrites the original', async () => {
  const server = await startTestApp()
  const gf = await createGround('checkin')
  const owner = await createUser('checkin-owner')
  const umpire = await createUser('checkin-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const first = await json(`${server.baseUrl}/matches/${match.id}/checkin`, {
      method: 'POST',
      token: umpire.token,
      body: { latitude: 12.9716, longitude: 77.5946 },
    })
    assert.equal(first.status, 200, JSON.stringify(first.data))
    assert.ok(first.data.slot.checked_in_at)
    assert.equal(Number(first.data.slot.check_in_latitude), 12.9716)
    const firstCheckInTime = first.data.slot.checked_in_at

    const notified = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_CHECKED_IN'`, [owner.id])
    assert.equal(notified.rows[0].n, 1)

    // Second check-in with a DIFFERENT location must not overwrite the first.
    const second = await json(`${server.baseUrl}/matches/${match.id}/checkin`, {
      method: 'POST',
      token: umpire.token,
      body: { latitude: 1, longitude: 1 },
    })
    assert.equal(second.status, 200, JSON.stringify(second.data))
    assert.equal(second.data.slot.checked_in_at, firstCheckInTime)
    assert.equal(Number(second.data.slot.check_in_latitude), 12.9716)
  } finally {
    await umpire.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('a normal player (not assigned to this match) cannot check in', async () => {
  const server = await startTestApp()
  const gf = await createGround('checkin-denied')
  const player = await createUser('checkin-denied-player')
  const teams = await makeTeams()
  try {
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    const res = await json(`${server.baseUrl}/matches/${match.id}/checkin`, { method: 'POST', token: player.token })
    assert.equal(res.status, 403)
  } finally {
    await player.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
