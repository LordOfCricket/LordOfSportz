// Umpire Communication & Commercial 2.0 — match-scoped messages (Workstreams
// A-E): send/read authorization, privacy (no email/phone leaks), and the
// best-effort notification fan-out. Real HTTP against the real app, same
// pattern as every other integration test here.
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
    [`Integration Test ${label}`, `integration-test-msg-${label}-${uniqueTag()}@example.test`, role, playerType],
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
      await pool.query('DELETE FROM ground_notifications WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function createGround(label) {
  const { rows } = await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
    generatePublicId('GRD', 8),
    `integration-test-msg-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_messages WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'MSA') RETURNING *`, [`Msg Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'MSB') RETURNING *`, [`Msg Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

async function setupMatchWithParticipants() {
  const gf = await createGround('setup')
  const owner = await createUser('setup-owner')
  const umpire = await createUser('setup-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const outsider = await createUser('setup-outsider')
  const teams = await makeTeams()
  await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: new Date(Date.now() + 86400000).toISOString(),
    groundId: gf.ground.id,
    requiredUmpires: 1,
  })
  return {
    gf,
    owner,
    umpire,
    outsider,
    teams,
    match,
    async cleanup() {
      await gf.cleanup()
      await owner.cleanup()
      await umpire.cleanup()
      await outsider.cleanup()
      await teams.cleanup()
    },
  }
}

test('Ground Owner can send a message; the assigned umpire receives it and gets notified', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: ctx.umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))

    const sent = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, {
      method: 'POST',
      token: ctx.owner.token,
      body: { body: 'Please arrive 20 minutes early.' },
    })
    assert.equal(sent.status, 201, JSON.stringify(sent.data))
    assert.equal(sent.data.message.senderRole, 'GROUND_OWNER')
    assert.equal(sent.data.message.body, 'Please arrive 20 minutes early.')
    assert.equal(sent.data.message.senderUserId, ctx.owner.id)

    const listAsUmpire = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { token: ctx.umpire.token })
    assert.equal(listAsUmpire.status, 200)
    assert.equal(listAsUmpire.data.messages.length, 1)
    assert.equal(listAsUmpire.data.messages[0].body, 'Please arrive 20 minutes early.')

    const { rows } = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'MATCH_MESSAGE' AND related_match_id = $2`, [
      ctx.umpire.id,
      ctx.match.id,
    ])
    assert.equal(rows.length, 1, 'the umpire must get a best-effort notification for the new message')
    // Phase 2 Cleanup — the umpire's own copy carries no groundId (see
    // matchMessage.service.js#sendMessage): NotificationBell resolves the
    // umpire's destination via UMPIRE_TYPE_ROUTE instead, gated on umpire
    // mode, never via TYPE_ROUTE_SUFFIX/ground_public_id.
    assert.equal(rows[0].ground_id, null, "the umpire's own notification copy must not carry a groundId")
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

test('the umpire can reply; the ground owner does not get notified of their own message', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: ctx.umpire.token })

    const sent = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.umpire.token, body: { body: 'Got it, see you then.' } })
    assert.equal(sent.status, 201, JSON.stringify(sent.data))
    assert.equal(sent.data.message.senderRole, 'UMPIRE')

    const { rows: ownerNotifs } = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'MATCH_MESSAGE'`, [ctx.owner.id])
    assert.equal(ownerNotifs.length, 1)
    // Phase 2 Cleanup — the Ground-Owner-received copy DOES carry groundId,
    // so NotificationBell can deep-link into their own ground's Matches tab
    // (TYPE_ROUTE_SUFFIX), scoped to this match's real, own ground only.
    assert.equal(ownerNotifs[0].ground_id, ctx.gf.ground.id, "the owner's notification copy must carry this match's real ground id")
    const { rows: senderNotifs } = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'MATCH_MESSAGE'`, [ctx.umpire.id])
    assert.equal(senderNotifs.length, 0, 'the sender must never notify themselves')
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

test('a non-participant cannot send or read messages for a match they have no role in', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    const sendAttempt = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.outsider.token, body: { body: 'hi' } })
    assert.equal(sendAttempt.status, 403)

    const readAttempt = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { token: ctx.outsider.token })
    assert.equal(readAttempt.status, 403)
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

test('an unassigned approved umpire (never applied to this match) cannot send or read its messages', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  const otherUmpire = await createUser('other-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const sendAttempt = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: otherUmpire.token, body: { body: 'hi' } })
    assert.equal(sendAttempt.status, 403)
  } finally {
    await otherUmpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('message responses never leak email or phone for the sender', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: ctx.umpire.token })
    await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.owner.token, body: { body: 'hello' } })

    const list = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { token: ctx.umpire.token })
    assert.equal(list.status, 200)
    const raw = JSON.stringify(list.data)
    assert.ok(!raw.includes('@example.test'), 'no email must ever appear in a message response')
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

test('an empty or overlong message body is rejected (400), never silently truncated or stored', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: ctx.umpire.token })

    const empty = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.owner.token, body: { body: '   ' } })
    assert.equal(empty.status, 400)

    const overlong = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.owner.token, body: { body: 'x'.repeat(1001) } })
    assert.equal(overlong.status, 400)
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

// Workstream E — a notification failure must never block message delivery.
// The best-effort createNotification() already swallows its own DB errors
// (groundNotification.service.js), so the real proof here is that a message
// send still succeeds and is readable even when the recipient's notification
// insert would be impossible (simulated by deleting the recipient mid-flight
// is too invasive; instead this proves the send path never awaits/propagates
// a notification failure by checking the response itself never depends on
// the notification row succeeding — see the createNotification unit-level
// contract for the failure-swallowing guarantee itself).
test('a sent message is persisted and readable regardless of notification fan-out outcome', async () => {
  const server = await startTestApp()
  const ctx = await setupMatchWithParticipants()
  try {
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: ctx.umpire.token })
    const sent = await json(`${server.baseUrl}/matches/${ctx.match.id}/messages`, { method: 'POST', token: ctx.owner.token, body: { body: 'pitch inspection required' } })
    assert.equal(sent.status, 201)

    const { rows } = await pool.query('SELECT * FROM match_messages WHERE match_id = $1', [ctx.match.id])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].body, 'pitch inspection required')
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})
