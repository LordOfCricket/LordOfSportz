// Phase 21 (U7) — notification TRIGGERS for the 3 event types U1 already
// prepared the schema for (ground_notifications.type CHECK,
// related_match_id) but nothing ever fired until now: an umpire's slot
// being assigned/cancelled, and an umpire request being decided. Real HTTP
// against the real app, same pattern as every prior U-phase test file.
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

// Phase 6 — requireStaffRole('super_admin') on PATCH /umpire-requests/:id
// now requires req.mfaVerified. `elevate` mints a REAL, already-MFA-verified
// session cookie — see helpers/mfaFixtures.js (this file isn't testing MFA,
// only notification delivery).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

async function makeUser({ label, role = 'player', playerType = null, requestStatuses = [], staffRoleName = null }) {
  let staffRoleId = null
  if (staffRoleName) {
    staffRoleId = (await pool.query(`SELECT id FROM staff_roles WHERE name = $1`, [staffRoleName])).rows[0].id
  }
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type, staff_role_id) VALUES ($1,$2,'not-a-real-hash',$3,$4,$5) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-u7-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`, role, playerType, staffRoleId],
  )
  const user = rows[0]
  for (const status of requestStatuses) {
    const decidedAt = status === 'pending' ? null : new Date()
    await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, $2, $3)`, [user.id, status, decidedAt])
  }
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM ground_notifications WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

function approvedUmpire(label) {
  return makeUser({ label, playerType: 'umpire', requestStatuses: ['approved'] })
}

async function makeGround(label) {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `integration-test-u7-ground-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, `Integration Test Ground ${label}`],
  )
  return rows[0]
}

async function makeTeams(label) {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U7A') RETURNING *`, [`U7 Team A ${label}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'U7B') RETURNING *`, [`U7 Team B ${label}`])).rows[0]
  return { teamA, teamB }
}

async function latestNotification(userId, type) {
  const { rows } = await pool.query(
    `SELECT * FROM ground_notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, type],
  )
  return rows[0] || null
}

// ---------------------------------------------------------------------------
// Umpire slot assigned
// ---------------------------------------------------------------------------

test('applying for a slot notifies the umpire (UMPIRE_SLOT_ASSIGNED) with the real match linked', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('assign-notify')
  const umpire = await approvedUmpire('assign-notify')
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date().toISOString(), requiredUmpires: 1 })
  try {
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const notif = await latestNotification(umpire.id, 'UMPIRE_SLOT_ASSIGNED')
    assert.ok(notif, 'the umpire must receive a real notification row')
    assert.equal(notif.related_match_id, match.id)
    assert.equal(notif.is_read, false)
  } finally {
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await server.close()
  }
})

test('applying for a slot on an OWNED ground also notifies the ground owner, naming the real umpire', async () => {
  const server = await startTestApp()
  const ground = await makeGround('assign-owner-notify')
  const owner = await makeUser({ label: 'assign-owner-notify' })
  const teams = await makeTeams('assign-owner-notify')
  const umpire = await approvedUmpire('assign-owner-notify')
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: new Date().toISOString(),
    groundId: ground.id,
    requiredUmpires: 1,
  })
  try {
    await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })

    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const ownerNotif = await latestNotification(owner.id, 'UMPIRE_SLOT_ASSIGNED')
    assert.ok(ownerNotif, 'the ground owner must be notified when their match gets an umpire')
    assert.equal(ownerNotif.related_match_id, match.id)
    assert.ok(ownerNotif.body.includes('Integration Test'), 'the notification must name the real assigned umpire, not a placeholder')
  } finally {
    await owner.cleanup()
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('a ground-less (legacy) match notifies only the umpire, not a nonexistent owner', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('no-ground-notify')
  const umpire = await approvedUmpire('no-ground-notify')
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date().toISOString(), requiredUmpires: 1 })
  try {
    assert.equal(match.ground_id, null, 'test setup sanity check')
    const applied = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    assert.equal(applied.status, 201)

    const umpireNotif = await latestNotification(umpire.id, 'UMPIRE_SLOT_ASSIGNED')
    assert.ok(umpireNotif)

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ground_notifications WHERE related_match_id = $1`, [match.id])
    assert.equal(rows[0].n, 1, 'exactly one notification (the umpire) — no owner exists to also notify')
  } finally {
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Umpire slot cancelled
// ---------------------------------------------------------------------------

test('cancelling an assignment notifies both the umpire and the ground owner (UMPIRE_SLOT_CANCELLED)', async () => {
  const server = await startTestApp()
  const ground = await makeGround('cancel-notify')
  const owner = await makeUser({ label: 'cancel-notify' })
  const teams = await makeTeams('cancel-notify')
  const umpire = await approvedUmpire('cancel-notify')
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    // 3 days out, not "now" — this test self-cancels, which Phase 2's 24h
    // assignment lock (matchTimeRange.js#isAssignmentLocked) would
    // otherwise correctly refuse.
    matchDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    groundId: ground.id,
    requiredUmpires: 1,
  })
  try {
    await createMembership({ groundId: ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })

    const cancelled = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(cancelled.status, 200)

    const umpireNotif = await latestNotification(umpire.id, 'UMPIRE_SLOT_CANCELLED')
    assert.ok(umpireNotif, 'the umpire must be notified their own cancellation went through')
    assert.equal(umpireNotif.related_match_id, match.id)

    const ownerNotif = await latestNotification(owner.id, 'UMPIRE_SLOT_CANCELLED')
    assert.ok(ownerNotif, 'the ground owner must be notified their match needs a replacement umpire')
    assert.equal(ownerNotif.related_match_id, match.id)
  } finally {
    await owner.cleanup()
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    await server.close()
  }
})

test('a failed cancel attempt (no active assignment) never creates a notification', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('failed-cancel-notify')
  const umpire = await approvedUmpire('failed-cancel-notify')
  // 3 days out — see the cancel-notification test above for why this can't be "now".
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date(Date.now() + 3 * 86400000).toISOString(), requiredUmpires: 1 })
  try {
    const cancelled = await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/cancel`, { method: 'POST', token: umpire.token })
    assert.equal(cancelled.status, 404)

    const notif = await latestNotification(umpire.id, 'UMPIRE_SLOT_CANCELLED')
    assert.equal(notif, null)
  } finally {
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Umpire request decided
// ---------------------------------------------------------------------------

test('approving an umpire request notifies the requesting user (UMPIRE_REQUEST_DECIDED)', async () => {
  const server = await startTestApp()
  const admin = await makeUser({ label: 'decide-approve-admin', role: 'staff', staffRoleName: 'super_admin' })
  await elevate(admin)
  const applicant = await makeUser({ label: 'decide-approve-applicant', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    const { rows } = await pool.query(`SELECT id FROM umpire_requests WHERE user_id = $1`, [applicant.id])
    const requestId = rows[0].id

    const decided = await json(`${server.baseUrl}/umpire-requests/${requestId}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'approved' } })
    assert.equal(decided.status, 200, JSON.stringify(decided.data))

    const notif = await latestNotification(applicant.id, 'UMPIRE_REQUEST_DECIDED')
    assert.ok(notif)
    assert.match(notif.title, /approved/i)
  } finally {
    await applicant.cleanup()
    await admin.cleanup()
    await server.close()
  }
})

test('rejecting an umpire request notifies the requesting user with the correct outcome', async () => {
  const server = await startTestApp()
  const admin = await makeUser({ label: 'decide-reject-admin', role: 'staff', staffRoleName: 'super_admin' })
  await elevate(admin)
  const applicant = await makeUser({ label: 'decide-reject-applicant', playerType: 'umpire', requestStatuses: ['pending'] })
  try {
    const { rows } = await pool.query(`SELECT id FROM umpire_requests WHERE user_id = $1`, [applicant.id])
    const requestId = rows[0].id

    const decided = await json(`${server.baseUrl}/umpire-requests/${requestId}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'rejected' } })
    assert.equal(decided.status, 200)

    const notif = await latestNotification(applicant.id, 'UMPIRE_REQUEST_DECIDED')
    assert.ok(notif)
    assert.match(notif.title, /declined/i)
  } finally {
    await applicant.cleanup()
    await admin.cleanup()
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// General: existing notification read/list behavior unaffected
// ---------------------------------------------------------------------------

test('a new umpire notification behaves exactly like any other via the existing notification endpoints (list + mark read)', async () => {
  const server = await startTestApp()
  const teams = await makeTeams('existing-endpoints')
  const umpire = await approvedUmpire('existing-endpoints')
  const match = await matchService.createMatch({ teamAId: teams.teamA.id, teamBId: teams.teamB.id, matchDate: new Date().toISOString(), requiredUmpires: 1 })
  try {
    await json(`${server.baseUrl}/matches/${match.id}/umpire-slots/apply`, { method: 'POST', token: umpire.token })
    const notif = await latestNotification(umpire.id, 'UMPIRE_SLOT_ASSIGNED')

    const list = await json(`${server.baseUrl}/ground/notifications`, { token: umpire.token })
    assert.equal(list.status, 200)
    assert.ok(list.data.notifications.some((n) => n.id === notif.id))
    assert.ok(list.data.unreadCount >= 1)

    const marked = await json(`${server.baseUrl}/ground/notifications/${notif.id}/read`, { method: 'POST', token: umpire.token })
    assert.equal(marked.status, 200)

    const { rows } = await pool.query('SELECT is_read FROM ground_notifications WHERE id = $1', [notif.id])
    assert.equal(rows[0].is_read, true)
  } finally {
    await umpire.cleanup()
    await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
    await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
    await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teams.teamA.id, teams.teamB.id]])
    await server.close()
  }
})
