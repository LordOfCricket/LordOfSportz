// Umpire Proposals — Ground-Owner-initiated invitations to a specific
// approved umpire for a specific open slot, optionally with a private
// bonus on top of the match's base fee (Uber/Rapido-style "+₹50, +₹100").
// Multiple candidates can each hold their own PENDING proposal for the
// same slot at once — first to accept wins, every other pending proposal
// for that slot auto-expires. Real HTTP against the real app, same pattern
// as umpireNoShowReplacement.integration.test.js / umpireCommerce.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { createTeamsFixture } from './fixtures.js'
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
// umpire proposals).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-proposal-${label}-${uniqueTag()}@example.test`, role, playerType],
  )
  const user = rows[0]
  if (umpireRequestStatus) {
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, NOW())`, [user.id, umpireRequestStatus])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM umpire_proposals WHERE umpire_user_id = $1 OR proposed_by = $1', [user.id])
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
    `integration-test-proposal-ground-${label}-${uniqueTag()}`,
    `Integration Test Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM umpire_proposals WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_earnings WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id IN (SELECT id FROM matches WHERE ground_id = $1)', [ground.id])
      await pool.query('DELETE FROM matches WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

async function setupContext({ requiredUmpires = 1 } = {}) {
  const gf = await createGround('setup')
  const owner = await createUser('setup-owner')
  const teams = await createTeamsFixture()
  await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
  await elevate(owner)
  const match = await matchService.createMatch({
    teamAId: teams.teamAId,
    teamBId: teams.teamBId,
    matchDate: new Date(Date.now() + 86400000).toISOString(),
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

async function getOpenSlotId(server, ctx) {
  const slots = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, {
    cookie: ctx.owner.cookie,
  })
  return slots.data.slots[0].id
}

function proposeUrl(server, ctx, slotId) {
  return `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots/${slotId}/propose`
}

// -----------------------------------------------------------------------
// Propose validation
// -----------------------------------------------------------------------

test('Propose 1 — Ground Owner can propose an open slot to an approved umpire with a bonus', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('propose-ok', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const res = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 100, message: 'Big match, need you there!' },
    })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(res.data.proposal.status, 'PENDING')
    assert.equal(Number(res.data.proposal.incentive_amount), 100)

    const notified = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_PROPOSAL_RECEIVED'`, [
      umpire.id,
    ])
    assert.equal(notified.rows[0].n, 1)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Propose 2 — a non-owner cannot propose (403); a non-approved-umpire candidate is rejected (403)', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const intruder = await createUser('propose-intruder')
  const normalPlayer = await createUser('propose-normal-player')
  try {
    const slotId = await getOpenSlotId(server, ctx)

    const asIntruder = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      token: intruder.token,
      body: { umpireUserId: normalPlayer.id, incentiveAmount: 50 },
    })
    assert.equal(asIntruder.status, 403)

    const toNormalPlayer = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: normalPlayer.id, incentiveAmount: 50 },
    })
    assert.equal(toNormalPlayer.status, 403, JSON.stringify(toNormalPlayer.data))
    assert.equal(toNormalPlayer.data.code, 'NOT_APPROVED_UMPIRE')
  } finally {
    await normalPlayer.cleanup()
    await intruder.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Propose 3 — a slot that is already ASSIGNED cannot receive a new proposal (409); an invalid incentive amount is rejected (400)', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const firstUmpire = await createUser('propose-first', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const secondUmpire = await createUser('propose-second', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)

    // Validated while the slot is still open, so this exercises amount
    // validation itself rather than being shadowed by the slot-status check.
    const badAmount = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: secondUmpire.id, incentiveAmount: -10 },
    })
    assert.equal(badAmount.status, 400)

    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: firstUmpire.token })
    assert.equal(applied.status, 201)

    const res = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: secondUmpire.id, incentiveAmount: 50 },
    })
    assert.equal(res.status, 409, JSON.stringify(res.data))
    assert.equal(res.data.code, 'SLOT_NOT_ELIGIBLE')
  } finally {
    await secondUmpire.cleanup()
    await firstUmpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Multi-candidate race — first accept wins
// -----------------------------------------------------------------------

test('Race — two umpires proposed the same slot with different bonuses; one accepts, the other auto-expires and is notified', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpireA = await createUser('race-a', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireB = await createUser('race-b', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const proposeA = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireA.id, incentiveAmount: 50 },
    })
    const proposeB = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireB.id, incentiveAmount: 100 },
    })
    assert.equal(proposeA.status, 201)
    assert.equal(proposeB.status, 201)

    const accept = await json(`${server.baseUrl}/umpire/proposals/${proposeB.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpireB.token,
      body: { accept: true },
    })
    assert.equal(accept.status, 200, JSON.stringify(accept.data))
    assert.equal(accept.data.slot.status, 'ASSIGNED')
    assert.equal(accept.data.slot.umpire_user_id, umpireB.id)
    assert.equal(Number(accept.data.slot.incentive_amount), 100)

    const { rows: proposalRows } = await pool.query('SELECT id, status FROM umpire_proposals WHERE match_umpire_slot_id = $1 ORDER BY id', [slotId])
    const byId = Object.fromEntries(proposalRows.map((r) => [r.id, r.status]))
    assert.equal(byId[proposeA.data.proposal.id], 'EXPIRED')
    assert.equal(byId[proposeB.data.proposal.id], 'ACCEPTED')

    const notifiedA = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_PROPOSAL_EXPIRED'`,
      [umpireA.id],
    )
    assert.equal(notifiedA.rows[0].n, 1)

    // Umpire A can no longer accept their own now-expired proposal.
    const lateAccept = await json(`${server.baseUrl}/umpire/proposals/${proposeA.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpireA.token,
      body: { accept: true },
    })
    assert.equal(lateAccept.status, 409, JSON.stringify(lateAccept.data))
    assert.equal(lateAccept.data.code, 'PROPOSAL_NOT_PENDING')
  } finally {
    await umpireB.cleanup()
    await umpireA.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Guard — an umpire already holding one slot on a match cannot also accept a proposal for the match\'s other slot (clean 409, not a raw 500)', async () => {
  const server = await startTestApp()
  const ctx = await setupContext({ requiredUmpires: 2 })
  const umpire = await createUser('double-slot', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slots = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, {
      cookie: ctx.owner.cookie,
    })
    assert.equal(slots.data.slots.length, 2)
    const [slotOneId, slotTwoId] = slots.data.slots.map((s) => s.id)

    // Umpire self-applies and wins slot one.
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    assert.equal(applied.data.slot.id, slotOneId)

    // Owner (unaware the umpire already holds slot one) proposes the SAME
    // umpire for slot two — assertUmpireEligibleForMatch's overlap check
    // deliberately excludes THIS match, so this must be rejected by the
    // idx_match_umpire_slots_active_umpire guard, not silently allowed.
    const propose = await json(proposeUrl(server, ctx, slotTwoId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 0 },
    })
    assert.equal(propose.status, 201, JSON.stringify(propose.data))

    const accept = await json(`${server.baseUrl}/umpire/proposals/${propose.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpire.token,
      body: { accept: true },
    })
    assert.equal(accept.status, 409, JSON.stringify(accept.data))
    assert.equal(accept.data.code, 'ALREADY_ASSIGNED')

    // Slot two must still be open — the rejected accept must not have
    // partially mutated it.
    const { rows: slotTwoRows } = await pool.query('SELECT status FROM match_umpire_slots WHERE id = $1', [slotTwoId])
    assert.equal(slotTwoRows[0].status, 'AVAILABLE')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Race — a plain self-apply that fills a slot also expires any pending proposals for it', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const proposedUmpire = await createUser('race-selfapply-proposed', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const applyingUmpire = await createUser('race-selfapply-applying', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const propose = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: proposedUmpire.id, incentiveAmount: 75 },
    })
    assert.equal(propose.status, 201)

    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: applyingUmpire.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    // A direct self-claim never carries a bonus.
    assert.equal(Number(applied.data.slot.incentive_amount), 0)

    const { rows } = await pool.query('SELECT status FROM umpire_proposals WHERE id = $1', [propose.data.proposal.id])
    assert.equal(rows[0].status, 'EXPIRED')
  } finally {
    await applyingUmpire.cleanup()
    await proposedUmpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Decline / owner-cancel
// -----------------------------------------------------------------------

test('Decline — an umpire can decline a proposal; the slot stays open and the owner is notified', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('decline-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const propose = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 50 },
    })

    const decline = await json(`${server.baseUrl}/umpire/proposals/${propose.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpire.token,
      body: { accept: false },
    })
    assert.equal(decline.status, 200, JSON.stringify(decline.data))
    assert.equal(decline.data.proposal.status, 'DECLINED')

    const slots = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, {
      cookie: ctx.owner.cookie,
    })
    assert.equal(slots.data.slots.find((s) => s.id === slotId).status, 'AVAILABLE')

    const notified = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_PROPOSAL_DECLINED'`, [
      ctx.owner.id,
    ])
    assert.equal(notified.rows[0].n, 1)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Cancel — the owner can withdraw a still-pending proposal; the umpire is notified; a non-pending proposal cannot be withdrawn', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('cancel-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const propose = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 50 },
    })

    const cancel = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/proposals/${propose.data.proposal.id}/cancel`,
      { method: 'POST', cookie: ctx.owner.cookie },
    )
    assert.equal(cancel.status, 200, JSON.stringify(cancel.data))
    assert.equal(cancel.data.proposal.status, 'CANCELLED')

    const notified = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_PROPOSAL_WITHDRAWN'`, [
      umpire.id,
    ])
    assert.equal(notified.rows[0].n, 1)

    const secondCancel = await json(
      `${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/proposals/${propose.data.proposal.id}/cancel`,
      { method: 'POST', cookie: ctx.owner.cookie },
    )
    assert.equal(secondCancel.status, 409, JSON.stringify(secondCancel.data))
    assert.equal(secondCancel.data.code, 'PROPOSAL_NOT_PENDING')

    // The umpire can no longer accept a withdrawn offer.
    const lateAccept = await json(`${server.baseUrl}/umpire/proposals/${propose.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpire.token,
      body: { accept: true },
    })
    assert.equal(lateAccept.status, 409)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Earnings — base + bonus
// -----------------------------------------------------------------------

test('Earnings — a completed slot with an accepted proposal earns base fee + bonus; an incentive-only offer (no base fee) still earns the bonus alone', async () => {
  const server = await startTestApp()
  const ctx = await setupContext({ requiredUmpires: 2 })
  const umpireBonusOnTopOfFee = await createUser('earn-fee-plus-bonus', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireBonusOnly = await createUser('earn-bonus-only', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 500, currency: 'INR' },
    })

    const slotsBefore = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-slots`, {
      cookie: ctx.owner.cookie,
    })
    const [slotOneId, slotTwoId] = slotsBefore.data.slots.map((s) => s.id)

    const proposeOne = await json(proposeUrl(server, ctx, slotOneId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireBonusOnTopOfFee.id, incentiveAmount: 150 },
    })
    const proposeTwo = await json(proposeUrl(server, ctx, slotTwoId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireBonusOnly.id, incentiveAmount: 200 },
    })
    assert.equal(proposeOne.status, 201)
    assert.equal(proposeTwo.status, 201)

    await json(`${server.baseUrl}/umpire/proposals/${proposeOne.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpireBonusOnTopOfFee.token,
      body: { accept: true },
    })
    await json(`${server.baseUrl}/umpire/proposals/${proposeTwo.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpireBonusOnly.token,
      body: { accept: true },
    })

    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    const { rows: earn1 } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpireBonusOnTopOfFee.id])
    assert.equal(Number(earn1[0].amount), 650) // 500 base + 150 bonus

    const { rows: earn2 } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpireBonusOnly.id])
    assert.equal(Number(earn2[0].amount), 700) // 500 base + 200 bonus
  } finally {
    await umpireBonusOnly.cleanup()
    await umpireBonusOnTopOfFee.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Earnings — a bonus-only offer on a match with NO base fee set still creates a real earning for the bonus alone', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('earn-no-base-fee', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    const propose = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 80 },
    })
    await json(`${server.baseUrl}/umpire/proposals/${propose.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpire.token,
      body: { accept: true },
    })

    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    const { rows } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpire.id])
    assert.equal(rows.length, 1)
    assert.equal(Number(rows[0].amount), 80)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Privacy + authorization scoping
// -----------------------------------------------------------------------

test('Privacy — an umpire\'s proposal inbox never exposes another party\'s email/phone', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('privacy-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    const slotId = await getOpenSlotId(server, ctx)
    await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 60, message: 'Please come' },
    })

    const inbox = await json(`${server.baseUrl}/umpire/proposals`, { token: umpire.token })
    assert.equal(inbox.status, 200)
    const serialized = JSON.stringify(inbox.data)
    assert.ok(!serialized.includes('@example.test'), 'proposal inbox must never leak an email address')
    assert.ok(!serialized.toLowerCase().includes('password'), 'proposal inbox must never leak password_hash')
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

test('Authorization — an umpire cannot respond to a proposal that was not sent to them; a different ground owner cannot see or cancel these proposals', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const otherGf = await createGround('other')
  const otherOwner = await createUser('auth-other-owner')
  const umpire = await createUser('auth-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const bystanderUmpire = await createUser('auth-bystander', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await createMembership({ groundId: otherGf.ground.id, userId: otherOwner.id, role: 'GROUND_OWNER' })
    await elevate(otherOwner)
    const slotId = await getOpenSlotId(server, ctx)
    const propose = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpire.id, incentiveAmount: 60 },
    })

    const wrongUmpireResponds = await json(`${server.baseUrl}/umpire/proposals/${propose.data.proposal.id}/respond`, {
      method: 'POST',
      token: bystanderUmpire.token,
      body: { accept: true },
    })
    assert.equal(wrongUmpireResponds.status, 404, JSON.stringify(wrongUmpireResponds.data))
    assert.equal(wrongUmpireResponds.data.code, 'PROPOSAL_NOT_FOUND')

    const otherOwnerListsMatch = await json(
      `${server.baseUrl}/ground-owner/grounds/${otherGf.ground.public_ground_id}/matches/${ctx.match.id}/proposals`,
      { cookie: otherOwner.cookie },
    )
    assert.equal(otherOwnerListsMatch.status, 404, JSON.stringify(otherOwnerListsMatch.data))

    const otherOwnerCancels = await json(
      `${server.baseUrl}/ground-owner/grounds/${otherGf.ground.public_ground_id}/matches/${ctx.match.id}/proposals/${propose.data.proposal.id}/cancel`,
      { method: 'POST', cookie: otherOwner.cookie },
    )
    assert.equal(otherOwnerCancels.status, 404)
  } finally {
    await bystanderUmpire.cleanup()
    await umpire.cleanup()
    await otherOwner.cleanup()
    await otherGf.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// Regression — no proposal involved leaves the existing flow untouched
// -----------------------------------------------------------------------

test('Regression — a plain apply/complete with no proposal ever involved earns exactly the base fee, incentive_amount stays 0 throughout', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpire = await createUser('regression-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 300, currency: 'INR' },
    })
    const applied = await json(`${server.baseUrl}/matches/${ctx.match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)
    assert.equal(Number(applied.data.slot.incentive_amount), 0)

    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200)

    const { rows } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpire.id])
    assert.equal(rows.length, 1)
    assert.equal(Number(rows[0].amount), 300)
  } finally {
    await umpire.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})

// -----------------------------------------------------------------------
// End-to-end scenario
// -----------------------------------------------------------------------

test('End-to-end — owner proposes 2 umpires for one slot with different bonuses; umpire B accepts, umpire A is notified their offer expired; match completes; B earns base + bonus', async () => {
  const server = await startTestApp()
  const ctx = await setupContext()
  const umpireA = await createUser('e2e-a', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  const umpireB = await createUser('e2e-b', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    // 1. Owner sets a base fee, then proposes the same open slot to both
    // umpires with different bonuses.
    await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/umpire-fee`, {
      method: 'PATCH',
      cookie: ctx.owner.cookie,
      body: { amount: 400, currency: 'INR' },
    })
    const slotId = await getOpenSlotId(server, ctx)
    const proposeA = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireA.id, incentiveAmount: 50, message: 'Can you cover this one?' },
    })
    const proposeB = await json(proposeUrl(server, ctx, slotId), {
      method: 'POST',
      cookie: ctx.owner.cookie,
      body: { umpireUserId: umpireB.id, incentiveAmount: 150 },
    })
    assert.equal(proposeA.status, 201)
    assert.equal(proposeB.status, 201)

    // Both umpires see the offer in their own inbox, privately.
    const inboxA = await json(`${server.baseUrl}/umpire/proposals`, { token: umpireA.token })
    const inboxB = await json(`${server.baseUrl}/umpire/proposals`, { token: umpireB.token })
    assert.ok(inboxA.data.proposals.some((p) => p.id === proposeA.data.proposal.id))
    assert.ok(inboxB.data.proposals.some((p) => p.id === proposeB.data.proposal.id))
    assert.ok(!inboxA.data.proposals.some((p) => p.id === proposeB.data.proposal.id), 'umpire A must never see umpire B\'s offer')

    // 2. Umpire B accepts first.
    const accept = await json(`${server.baseUrl}/umpire/proposals/${proposeB.data.proposal.id}/respond`, {
      method: 'POST',
      token: umpireB.token,
      body: { accept: true },
    })
    assert.equal(accept.status, 200, JSON.stringify(accept.data))
    assert.equal(accept.data.slot.umpire_user_id, umpireB.id)
    assert.equal(Number(accept.data.slot.incentive_amount), 150)

    // 3. Umpire A's now-stale offer auto-expired and they were notified.
    const notifiedA = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ground_notifications WHERE user_id = $1 AND type = 'UMPIRE_PROPOSAL_EXPIRED'`,
      [umpireA.id],
    )
    assert.equal(notifiedA.rows[0].n, 1)
    const laterInboxA = await json(`${server.baseUrl}/umpire/proposals`, { token: umpireA.token })
    assert.equal(laterInboxA.data.proposals.find((p) => p.id === proposeA.data.proposal.id).status, 'EXPIRED')

    // 4. Match completes; B's earning is base fee + their own bonus, not A's.
    await pool.query(`UPDATE matches SET status = 'live' WHERE id = $1`, [ctx.match.id])
    const complete = await json(`${server.baseUrl}/ground-owner/grounds/${ctx.gf.ground.public_ground_id}/matches/${ctx.match.id}/complete`, {
      method: 'POST',
      cookie: ctx.owner.cookie,
    })
    assert.equal(complete.status, 200, JSON.stringify(complete.data))

    const { rows: earningsB } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpireB.id])
    assert.equal(earningsB.length, 1)
    assert.equal(Number(earningsB[0].amount), 550) // 400 base + 150 bonus

    const { rows: earningsA } = await pool.query('SELECT amount FROM umpire_earnings WHERE umpire_user_id = $1', [umpireA.id])
    assert.equal(earningsA.length, 0, 'umpire A never officiated, so they must never earn anything for this match')
  } finally {
    await umpireB.cleanup()
    await umpireA.cleanup()
    await ctx.cleanup()
    await server.close()
  }
})
