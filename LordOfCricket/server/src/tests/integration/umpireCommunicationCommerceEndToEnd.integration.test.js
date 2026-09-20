// Umpire Communication & Commercial 2.0 — the two required end-to-end
// scenarios, run as real HTTP + real database flows (no faked commercial
// state):
//
//  1. Ground Owner creates match -> sets umpire fee -> Umpire A assigned ->
//     assignment notification -> reminder generated -> A checks in ->
//     Owner + A exchange messages -> match starts -> match completes ->
//     A gets officiating credit -> earning record created -> PENDING ->
//     Owner can see fee/status -> A can see own earnings.
//
//  2. Umpire A NO_SHOW -> Umpire B replacement -> match completes ->
//     A gets no officiating earning, B does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { runReminderTick } from '../../services/reminderScheduler.service.js'
import { groundLocalNaiveTimestamp } from '../../domain/shared/groundTime.js'
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
// the umpire communication/commerce journey). /matches/:id/messages and
// /matches/:id/checkin are requireAuth-only, never ground-owner-gated, so
// owner.token stays valid for those calls unchanged.
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-e2ecomm-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_earnings WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
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
    `integration-test-e2ecomm-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM match_messages WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_earnings WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'E2A') RETURNING *`, [`E2E Comm Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'E2B') RETURNING *`, [`E2E Comm Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

test('Scenario 1 — full journey: create -> fee -> assign -> notify -> reminder -> check-in -> messages -> start -> complete -> earning -> PENDING -> both sides can view', async () => {
  const server = await startTestApp()
  const gf = await createGround('scenario1')
  const owner = await createUser('scenario1-owner')
  const umpireA = await createUser('scenario1-umpireA', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    // Ground Owner creates match, 28 minutes away (inside the 30M reminder window).
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: groundLocalNaiveTimestamp(new Date(Date.now() + 28 * 60000)),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    // Sets umpire fee.
    const feeRes = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: { amount: 800 },
    })
    assert.equal(feeRes.status, 200, JSON.stringify(feeRes.data))

    // Umpire A assigned.
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    const slotId = applied.data.slot.id

    // Umpire receives assignment notification.
    const { rows: assignNotifs } = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_SLOT_ASSIGNED'`, [umpireA.id])
    assert.equal(assignNotifs.length, 1)

    // Reminder generated (30-minute window).
    await runReminderTick()
    const { rows: reminderNotifs } = await pool.query(`SELECT * FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_REMINDER_30M'`, [umpireA.id])
    assert.equal(reminderNotifs.length, 1, 'a real reminder must fire for a match genuinely 28 minutes away')

    // Umpire checks in.
    const checkin = await json(`${server.baseUrl}/matches/${match.id}/checkin`, { method: 'POST', token: umpireA.token })
    assert.equal(checkin.status, 200, JSON.stringify(checkin.data))
    assert.ok(checkin.data.slot.checked_in_at)

    // Ground Owner + Umpire communicate.
    const ownerMsg = await json(`${server.baseUrl}/matches/${match.id}/messages`, { method: 'POST', token: owner.token, body: { body: 'Please arrive 20 minutes early.' } })
    assert.equal(ownerMsg.status, 201)
    const umpireReply = await json(`${server.baseUrl}/matches/${match.id}/messages`, { method: 'POST', token: umpireA.token, body: { body: 'On my way.' } })
    assert.equal(umpireReply.status, 201)
    const thread = await json(`${server.baseUrl}/matches/${match.id}/messages`, { token: owner.token })
    assert.equal(thread.data.messages.length, 2)

    // Match starts (bypasses the unrelated toss/playing-XI setup — not what
    // this scenario is proving) and completes.
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    // Umpire receives officiating credit.
    const { rows: completedEvents } = await pool.query(
      `SELECT * FROM umpire_assignment_events WHERE match_id = $1 AND umpire_user_id = $2 AND event_type = 'COMPLETED'`,
      [match.id, umpireA.id],
    )
    assert.equal(completedEvents.length, 1)

    // Earnings record created, PENDING.
    const { rows: earnings } = await pool.query('SELECT * FROM umpire_earnings WHERE match_umpire_slot_id = $1', [slotId])
    assert.equal(earnings.length, 1)
    assert.equal(earnings[0].amount, '800.00')
    assert.equal(earnings[0].status, 'PENDING')

    // Ground Owner can see the fee/status.
    const ownerView = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots`, { cookie: owner.cookie })
    assert.equal(ownerView.status, 200)
    assert.equal(ownerView.data.umpireFee.amount, '800.00')
    const ownerSlot = ownerView.data.slots.find((s) => s.id === slotId)
    assert.equal(ownerSlot.earning.status, 'PENDING')

    // Umpire can see own earnings.
    const umpireView = await json(`${server.baseUrl}/umpire/earnings`, { token: umpireA.token })
    assert.equal(umpireView.status, 200)
    assert.equal(umpireView.data.summary.hasAnyData, true)
    assert.equal(umpireView.data.recent.length, 1)
    assert.equal(umpireView.data.recent[0].status, 'PENDING')
  } finally {
    await umpireA.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Scenario 2 — no-show + replacement: A gets no officiating earning, B does', async () => {
  const server = await startTestApp()
  const gf = await createGround('scenario2')
  const owner = await createUser('scenario2-owner')
  const umpireA = await createUser('scenario2-umpireA', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireB = await createUser('scenario2-umpireB', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const teams = await makeTeams()
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)
    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 3600000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })

    await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: { amount: 800 },
    })
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    const slotId = applied.data.slot.id

    // Umpire A NO_SHOW.
    const noShow = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(noShow.status, 200)

    // Umpire B replacement.
    const replace = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: owner.cookie, body: { newUmpireUserId: umpireB.id } },
    )
    assert.equal(replace.status, 200, JSON.stringify(replace.data))

    // Match completes.
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${match.id}/complete`, {
      method: 'POST',
      cookie: owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    // A -> no officiating earning; B -> earning.
    const { rows: aEarnings } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpireA.id])
    const { rows: bEarnings } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpireB.id])
    assert.equal(aEarnings.length, 0)
    assert.equal(bEarnings.length, 1)
    assert.equal(bEarnings[0].amount, '800.00')
    assert.equal(bEarnings[0].status, 'PENDING')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await owner.cleanup()
    await gf.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
