// Ground Time-Slot Pricing — public-facing display: "Starts from ₹X" on
// discovery cards (GET /grounds/all, /grounds/nearby, /grounds/search) and
// the active-only pricing list on the public ground profile
// (GET /grounds/:publicGroundId). Same real-HTTP, disposable-fixture
// pattern as groundDiscovery.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { generatePublicId } from '../../utils/publicId.js'
import * as pricingService from '../../services/groundPricing.service.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createGround(label) {
  const { rows } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, city, status) VALUES ($1,$2,$3,'Test City','ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `integration-test-pricing-display-${label}-${uniqueTag()}`, `Integration Test Pricing Display Ground ${label}`],
  )
  return rows[0]
}

async function cleanupGround(ground) {
  await pool.query('DELETE FROM ground_audit_log WHERE entity_type = $1 AND entity_id IN (SELECT id FROM ground_pricing_slots WHERE ground_id = $2)', [
    'PRICING_SLOT',
    ground.id,
  ])
  await pool.query('DELETE FROM ground_pricing_slots WHERE ground_id = $1', [ground.id])
  await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
}

test('homepage/discovery cards show "starts from" as MIN(active price), and null (never a fabricated 0) when nothing is configured', async () => {
  const server = await startTestApp()
  const priced = await createGround('priced')
  const unpriced = await createGround('unpriced')
  try {
    await pricingService.createPricingSlot(priced, { startTime: '06:00', endTime: '09:00', price: 2000 }, null)
    const cheaperSlot = await pricingService.createPricingSlot(priced, { startTime: '09:00', endTime: '13:00', price: 1500 }, null)
    // An inactive slot with an even lower price must NOT win the MIN().
    await pricingService.createPricingSlot(priced, { startTime: '18:00', endTime: '22:00', price: 500 }, null)
    const inactiveOne = (await pricingService.listPricingSlots(priced)).find((s) => Number(s.price) === 500)
    await pricingService.updatePricingSlot(priced, inactiveOne.id, { isActive: false }, null)

    const res = await fetch(`${server.baseUrl}/grounds?limit=50`)
    assert.equal(res.status, 200)
    const data = await res.json()
    const pricedCard = data.grounds.find((g) => g.publicGroundId === priced.public_ground_id)
    const unpricedCard = data.grounds.find((g) => g.publicGroundId === unpriced.public_ground_id)

    assert.equal(pricedCard.startingPrice, 1500, 'MIN() of ACTIVE slots only — the cheaper INACTIVE 500 slot must not win')
    assert.equal(unpricedCard.startingPrice, null, 'no pricing configured must be null, never a fabricated 0')
    void cheaperSlot
  } finally {
    await cleanupGround(priced)
    await cleanupGround(unpriced)
    await server.close()
  }
})

test('public ground profile exposes only ACTIVE pricing slots, never a deactivated one', async () => {
  const server = await startTestApp()
  const ground = await createGround('profile')
  try {
    const active = await pricingService.createPricingSlot(ground, { startTime: '06:00', endTime: '09:00', price: 2000 }, null)
    const inactive = await pricingService.createPricingSlot(ground, { startTime: '09:00', endTime: '13:00', price: 1800 }, null)
    await pricingService.updatePricingSlot(ground, inactive.id, { isActive: false }, null)

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    assert.equal(res.status, 200)
    const data = await res.json()

    assert.equal(data.pricingSlots.length, 1)
    assert.equal(Number(data.pricingSlots[0].price), 2000)
    assert.equal(data.pricingSlots.some((s) => Number(s.price) === 1800), false, 'the deactivated slot must never be exposed publicly')
    void active
  } finally {
    await cleanupGround(ground)
    await server.close()
  }
})
