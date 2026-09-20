// Umpire Communication & Commercial 2.0 — fee configuration, earnings
// creation (including no-show/cancellation/replacement handling), and
// payment-status transitions. Real HTTP + real DB state, same pattern as
// every other integration test here.
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
// umpire fee/earnings/payment-status commerce).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-commerce-${label}-${uniqueTag()}@example.test`, role, playerType],
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
    `integration-test-commerce-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
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
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CMA') RETURNING *`, [`Commerce Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'CMB') RETURNING *`, [`Commerce Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

async function setupContext({ requiredUmpires = 1 } = {}) {
  const gf = await createGround('setup')
  const owner = await createUser('setup-owner')
  const teams = await makeTeams()
  await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  await elevate(owner)
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    // 3 days out, not 1 hour — some tests in this file self-cancel, which
    // Phase 2's 24h assignment lock (matchTimeRange.js#isAssignmentLocked)
    // would otherwise correctly refuse.
    matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    groundId: gf.ground.id,
    requiredUmpires,
  })
  return {
    gf,
    owner,
    teams,
    match,
    async cleanup() {
      await gf.cleanup()
      await owner.cleanup()
      await teams.cleanup()
    },
  }
}

// -----------------------------------------------------------------------
// Fee
// -----------------------------------------------------------------------

test('Fee 1/4 — Ground Owner can configure a valid fee, stored as a proper NUMERIC(10,2) representation', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  try {
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800, currency: 'inr' },
    })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    assert.equal(res.data.match.umpire_fee_amount, '800.00', 'must be a real decimal representation, not a float')
    assert.equal(res.data.match.umpire_fee_currency, 'INR', 'currency is normalized to uppercase')
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

test('Fee 2 — an unrelated user cannot set a fee for a match on a ground they do not own', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const outsider = await createUser('fee-outsider')
  try {
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      token: outsider.token,
      body: { amount: 800 },
    })
    assert.equal(res.status, 403)
  } finally {
    await outsider.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Fee 3 — the assigned umpire cannot set/modify the fee for their own match', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('fee-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const res = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      token: umpire.token,
      body: { amount: 800 },
    })
    assert.equal(res.status, 403, 'an umpire has no ground_users membership, so the ground-owner gate itself rejects them')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Fee 5 — the fee cannot be changed once the match has completed', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  try {
    const setBefore = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 500 },
    })
    assert.equal(setBefore.status, 200)

    // Bypasses the full toss/playing-XI start flow (irrelevant to what this
    // test is proving) — directly puts the match in the 'live' state
    // completeMatchManually requires, same shortcut the Reputation 2.0
    // scenario tests already established for this exact situation.
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, { method: 'POST', cookie: ctx.owner.cookie })

    const setAfter = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 900 },
    })
    assert.equal(setAfter.status, 409, 'the fee must be locked once the match has completed')
  } finally {
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Earnings
// -----------------------------------------------------------------------

test('Earnings 6 — a completed umpire receives an earning record with the agreed fee', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('earn-completed', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800 },
    })
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    const { rows } = await pool.query('SELECT * FROM umpire_earnings WHERE match_id = $1 AND umpire_user_id = $2', [ctx.match.id, umpire.id])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].amount, '800.00')
    assert.equal(rows[0].status, 'PENDING')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Earnings 7 — a NO_SHOW umpire never receives an officiating earning', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('earn-noshow', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800 },
    })
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const slotId = applied.data.slot.id

    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })

    const { rows } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpire.id])
    assert.equal(rows.length, 0, 'a no-show slot never reaches COMPLETED for this umpire — no earning must ever be created')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Earnings 8 — an umpire who cancelled their own assignment never receives an earning', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('earn-cancelled', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800 },
    })
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const cancelled = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data))

    const { rows } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpire.id])
    assert.equal(rows.length, 0)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Earnings 9 — after a no-show + replacement, only the replacement receives an earning', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpireA = await createUser('earn-repl-a', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireB = await createUser('earn-repl-b', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800 },
    })
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    const slotId = applied.data.slot.id

    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/no-show`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    const replaced = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: ctx.owner.cookie, body: { newUmpireUserId: umpireB.id } },
    )
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data))

    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    const { rows: aRows } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpireA.id])
    const { rows: bRows } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpireB.id])
    assert.equal(aRows.length, 0, 'the no-show umpire must never get credit')
    assert.equal(bRows.length, 1, 'the replacement who actually completed the match must get credit')
    assert.equal(bRows[0].amount, '800.00')
  } finally {
    await umpireA.cleanup()
    await umpireB.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Earnings 10 — no duplicate earning is ever created for the same completed assignment, even across repeated completion calls', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('earn-dup', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 800 },
    })
    await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])

    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, { method: 'POST', cookie: ctx.owner.cookie })
    // Idempotent no-op the second time (matchService.completeMatchManually's own contract) — must never create a second earning row.
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, { method: 'POST', cookie: ctx.owner.cookie })
    // Viewing the slots (which self-heals via ensureEarningRecordsForMatch) must also never duplicate.
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, { cookie: ctx.owner.cookie })

    const { rows } = await pool.query('SELECT * FROM umpire_earnings WHERE umpire_user_id = $1', [umpire.id])
    assert.equal(rows.length, 1, 'exactly one earning row, regardless of how many times completion/self-heal ran')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Payment status
// -----------------------------------------------------------------------

async function completeMatchWithEarning(server, ctx, umpire, amount = 800) {
  await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
    method: 'PATCH',
    cookie: ctx.owner.cookie,
    body: { amount },
  })
  const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
  const slotId = applied.data.slot.id
  await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
  await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, { method: 'POST', cookie: ctx.owner.cookie })
  return slotId
}

test('Payment status 11 — valid transitions succeed, invalid ones (e.g. PAID -> PENDING) are rejected', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('pay-transitions', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await completeMatchWithEarning(server, ctx, umpire)

    const toApproved = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/payment-status`,
      { method: 'PATCH', cookie: ctx.owner.cookie, body: { status: 'APPROVED' } },
    )
    assert.equal(toApproved.status, 200, JSON.stringify(toApproved.data))
    assert.equal(toApproved.data.earning.status, 'APPROVED')

    const toPaid = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/payment-status`,
      { method: 'PATCH', cookie: ctx.owner.cookie, body: { status: 'PAID' } },
    )
    assert.equal(toPaid.status, 200)
    assert.equal(toPaid.data.earning.status, 'PAID')

    const backToPending = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/payment-status`,
      { method: 'PATCH', cookie: ctx.owner.cookie, body: { status: 'PENDING' } },
    )
    assert.equal(backToPending.status, 409, 'PAID is terminal — no transition back out')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Payment status 12 — an unauthorized user (umpire or outsider) cannot modify payment status', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('pay-unauth-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const outsider = await createUser('pay-unauth-outsider')
  try {
    const slotId = await completeMatchWithEarning(server, ctx, umpire)

    const asUmpire = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/payment-status`,
      { method: 'PATCH', token: umpire.token, body: { status: 'APPROVED' } },
    )
    assert.equal(asUmpire.status, 403)

    const asOutsider = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/payment-status`,
      { method: 'PATCH', token: outsider.token, body: { status: 'APPROVED' } },
    )
    assert.equal(asOutsider.status, 403)
  } finally {
    await umpire.cleanup()
    await outsider.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Payment status 13/14 — the umpire can see their own earning status, and the Ground Owner can see it for their own match', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('pay-view', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await completeMatchWithEarning(server, ctx, umpire)

    const asUmpire = await json(`${server.baseUrl}/umpire/earnings`, { token: umpire.token })
    assert.equal(asUmpire.status, 200, JSON.stringify(asUmpire.data))
    assert.equal(asUmpire.data.recent.length, 1)
    assert.equal(asUmpire.data.recent[0].status, 'PENDING')
    assert.equal(asUmpire.data.summary.hasAnyData, true)

    const asOwner = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, {
      cookie: ctx.owner.cookie,
    })
    assert.equal(asOwner.status, 200)
    const slotWithEarning = asOwner.data.slots.find((s) => s.earning)
    assert.ok(slotWithEarning, 'the owner must be able to see the earning/payment status for their own match')
    assert.equal(slotWithEarning.earning.status, 'PENDING')
    assert.equal(asOwner.data.umpireFee.amount, '800.00')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Payment status 15 — an unauthenticated request can never see fee/earnings/payment status', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('pay-public', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await completeMatchWithEarning(server, ctx, umpire)

    const noAuthSlots = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`)
    assert.equal(noAuthSlots.status, 401)

    const noAuthEarnings = await json(`${server.baseUrl}/umpire/earnings`)
    assert.equal(noAuthEarnings.status, 401)

    // A logged-in but non-umpire player must also never see another umpire's earnings.
    const player = await createUser('pay-public-player')
    const asPlayer = await json(`${server.baseUrl}/umpire/earnings`, { token: player.token })
    assert.equal(asPlayer.status, 403)
    await player.cleanup()
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})
