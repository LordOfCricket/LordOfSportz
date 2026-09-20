// Ground Time-Slot Pricing — Ground Owner CRUD + authorization. Real HTTP
// against the real app, same pattern as groundOwnerMatchLifecycle.
// integration.test.js (whose helpers this file mirrors locally).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = { emit: () => {}, to: () => ({ emit: () => {} }) }
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
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createUser(label, { role = 'player', playerType = null, umpireRequestStatus = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash',$3,$4) RETURNING *`,
    [`Integration Test ${label}`, `integration-test-pricing-${label}-${uniqueTag()}@example.test`, role, playerType],
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
    `integration-test-pricing-ground-${label}-${uniqueTag()}`,
    `Integration Test Pricing Ground ${label}`,
  ])
  const ground = rows[0]
  return {
    ground,
    async cleanup() {
      await pool.query('DELETE FROM ground_audit_log WHERE entity_type = $1 AND entity_id IN (SELECT id FROM ground_pricing_slots WHERE ground_id = $2)', [
        'PRICING_SLOT',
        ground.id,
      ])
      await pool.query('DELETE FROM ground_pricing_slots WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
      await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
    },
  }
}

function slotsUrl(server, gf, slotId) {
  const base = `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/pricing-slots`
  return slotId ? `${base}/${slotId}` : base
}

test('pricing CRUD: owner can create, list, edit, deactivate, and delete a pricing slot', async () => {
  const server = await startTestApp()
  const gf = await createGround('crud')
  const owner = await createUser('crud-owner')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const created = await json(slotsUrl(server, gf), {
      method: 'POST',
      cookie: owner.cookie,
      body: { startTime: '06:00', endTime: '09:00', price: 2000 },
    })
    assert.equal(created.status, 201, JSON.stringify(created.data))
    assert.equal(created.data.slot.is_active, true)
    assert.equal(Number(created.data.slot.price), 2000)
    const slotId = created.data.slot.id

    const listed = await json(slotsUrl(server, gf), { cookie: owner.cookie })
    assert.equal(listed.status, 200)
    assert.equal(listed.data.slots.length, 1)

    const edited = await json(slotsUrl(server, gf, slotId), { method: 'PATCH', cookie: owner.cookie, body: { price: 2200 } })
    assert.equal(edited.status, 200, JSON.stringify(edited.data))
    assert.equal(Number(edited.data.slot.price), 2200)
    assert.equal(edited.data.slot.start_time, '06:00:00', 'unedited fields are preserved')

    const deactivated = await json(slotsUrl(server, gf, slotId), { method: 'PATCH', cookie: owner.cookie, body: { isActive: false } })
    assert.equal(deactivated.status, 200)
    assert.equal(deactivated.data.slot.is_active, false)

    const deleted = await json(slotsUrl(server, gf, slotId), { method: 'DELETE', cookie: owner.cookie })
    assert.equal(deleted.status, 204)

    const listedAfterDelete = await json(slotsUrl(server, gf), { cookie: owner.cookie })
    assert.equal(listedAfterDelete.data.slots.length, 0)

    const auditRows = await pool.query('SELECT action FROM ground_audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at', ['PRICING_SLOT', slotId])
    assert.deepEqual(auditRows.rows.map((r) => r.action), ['CREATED', 'UPDATED', 'DEACTIVATED', 'DELETED'])
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('pricing validation: start must be before end, price must be non-negative, overlapping ACTIVE slots are rejected', async () => {
  const server = await startTestApp()
  const gf = await createGround('validate')
  const owner = await createUser('validate-owner')
  try {
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const badRange = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '09:00', endTime: '06:00', price: 100 } })
    assert.equal(badRange.status, 400)
    assert.equal(badRange.data.code, 'INVALID_PRICING_SLOT')

    const badPrice = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '06:00', endTime: '09:00', price: -5 } })
    assert.equal(badPrice.status, 400)
    assert.equal(badPrice.data.code, 'INVALID_PRICING_SLOT')

    const first = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '06:00', endTime: '09:00', price: 2000 } })
    assert.equal(first.status, 201)

    const overlapping = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '08:00', endTime: '11:00', price: 2500 } })
    assert.equal(overlapping.status, 409, JSON.stringify(overlapping.data))
    assert.equal(overlapping.data.code, 'PRICING_SLOT_OVERLAP')

    const adjacent = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '09:00', endTime: '13:00', price: 2500 } })
    assert.equal(adjacent.status, 201, 'a touching, non-overlapping slot must be allowed')

    // Deactivating the first slot frees its time range for a new ACTIVE slot.
    const deactivated = await json(slotsUrl(server, gf, first.data.slot.id), { method: 'PATCH', cookie: owner.cookie, body: { isActive: false } })
    assert.equal(deactivated.status, 200)
    const reuseRange = await json(slotsUrl(server, gf), { method: 'POST', cookie: owner.cookie, body: { startTime: '06:00', endTime: '09:00', price: 1800 } })
    assert.equal(reuseRange.status, 201, 'an inactive slot\'s time range must be free to reuse')
  } finally {
    await owner.cleanup()
    await gf.cleanup()
    await server.close()
  }
})

test('pricing authorization: a non-owner (404), an unrelated approved umpire (403), and cross-ground access are all denied', async () => {
  const server = await startTestApp()
  const gfA = await createGround('auth-a')
  const gfB = await createGround('auth-b')
  const ownerA = await createUser('auth-owner-a')
  const stranger = await createUser('auth-stranger')
  const umpire = await createUser('auth-umpire', { playerType: 'umpire', umpireRequestStatus: 'approved' })
  try {
    await createMembership({ groundId: gfA.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })
    await elevate(ownerA)

    const asStranger = await json(slotsUrl(server, gfA), { method: 'POST', token: stranger.token, body: { startTime: '06:00', endTime: '09:00', price: 2000 } })
    assert.equal(asStranger.status, 403, 'a user with no ground membership must be denied')

    const asUmpire = await json(slotsUrl(server, gfA), { method: 'POST', token: umpire.token, body: { startTime: '06:00', endTime: '09:00', price: 2000 } })
    assert.equal(asUmpire.status, 403, 'an approved umpire has no ground membership here and must be denied')

    // Owner A creates a slot on Ground A, then tries to reach it through Ground B's URL.
    const createdOnA = await json(slotsUrl(server, gfA), { method: 'POST', cookie: ownerA.cookie, body: { startTime: '06:00', endTime: '09:00', price: 2000 } })
    assert.equal(createdOnA.status, 201)
    const slotIdOnA = createdOnA.data.slot.id

    await createMembership({ groundId: gfB.ground.id, userId: ownerA.id, role: 'GROUND_OWNER' })
    const crossGroundEdit = await json(slotsUrl(server, gfB, slotIdOnA), { method: 'PATCH', cookie: ownerA.cookie, body: { price: 1 } })
    assert.equal(crossGroundEdit.status, 404, 'a real slot id from a DIFFERENT ground must never be editable through this ground\'s URL')

    const crossGroundDelete = await json(slotsUrl(server, gfB, slotIdOnA), { method: 'DELETE', cookie: ownerA.cookie })
    assert.equal(crossGroundDelete.status, 404)

    // Confirm it's genuinely untouched.
    const stillThere = await pool.query('SELECT price FROM ground_pricing_slots WHERE id = $1', [slotIdOnA])
    assert.equal(Number(stillThere.rows[0].price), 2000)
  } finally {
    await umpire.cleanup()
    await stranger.cleanup()
    await ownerA.cleanup()
    await gfA.cleanup()
    await gfB.cleanup()
    await server.close()
  }
})
