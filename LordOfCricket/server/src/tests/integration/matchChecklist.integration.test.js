// Pre-match checklist (Phase 23, Workstream C) — persisted per (match,
// umpire), gated by the same requireMatchScorerByParam gate as
// toss/checkin (checklist completion can never bypass match authorization).
// Real HTTP against the real app, same pattern as every other integration
// test here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
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
    [`Integration Test ${label}`, `integration-test-checklist-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_match_checklist_items WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CKA') RETURNING *`, [`Checklist Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CKB') RETURNING *`, [`Checklist Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('a fresh checklist has all 8 fixed items unchecked; toggling one persists and survives a re-fetch', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await createUser('toggle', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      oversPerInnings: 20,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const fresh = await json(`${server.baseUrl}/matches/${match.id}/checklist`, { token: umpire.token })
    assert.equal(fresh.status, 200)
    assert.equal(fresh.data.items.length, 8)
    assert.ok(fresh.data.items.every((i) => i.isChecked === false))

    const toggled = await json(`${server.baseUrl}/matches/${match.id}/checklist`, {
      method: 'PATCH',
      token: umpire.token,
      body: { itemKey: 'PITCH_INSPECTED', isChecked: true },
    })
    assert.equal(toggled.status, 200, JSON.stringify(toggled.data))
    assert.equal(toggled.data.item.isChecked, true)
    assert.ok(toggled.data.item.checkedAt)

    const refetched = await json(`${server.baseUrl}/matches/${match.id}/checklist`, { token: umpire.token })
    const pitchItem = refetched.data.items.find((i) => i.itemKey === 'PITCH_INSPECTED')
    assert.equal(pitchItem.isChecked, true)
    assert.equal(refetched.data.items.filter((i) => i.isChecked).length, 1)
  } finally {
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('an invalid itemKey is rejected; an unassigned player cannot access the checklist', async () => {
  const server = await startTestApp()
  const teams = await makeTeams()
  const umpire = await createUser('invalid', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const stranger = await createUser('invalid-stranger')
  try {
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      oversPerInnings: 20,
      requiredUmpires: 1,
    })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const badKey = await json(`${server.baseUrl}/matches/${match.id}/checklist`, {
      method: 'PATCH',
      token: umpire.token,
      body: { itemKey: 'NOT_A_REAL_ITEM', isChecked: true },
    })
    assert.equal(badKey.status, 400)

    const asStranger = await json(`${server.baseUrl}/matches/${match.id}/checklist`, { token: stranger.token })
    assert.equal(asStranger.status, 403)
  } finally {
    await stranger.cleanup()
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
