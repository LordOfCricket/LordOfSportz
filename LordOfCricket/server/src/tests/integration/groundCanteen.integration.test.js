// Phase 8 — Ground + Canteen foundation. No controller/route exists yet
// (strict scope), so this tests the model layer + seed script directly
// against real Postgres, not HTTP. Covers: the real seeded ground/canteen
// have the expected authoritative values, the seed script is idempotent,
// and the schema's own uniqueness constraints actually hold.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import { generatePublicId } from '../../utils/publicId.js'
import { slugify } from '../../utils/slug.js'
import { createGround, findGroundBySlug, findGroundById } from '../../models/ground.model.js'
import { createCanteen, findCanteensByGroundId, findCanteenById } from '../../models/canteen.model.js'
import { seedGroundAndCanteen } from '../../scripts/seedGroundAndCanteen.js'

test('the real ground was seeded with the authoritative identity, not a placeholder', async () => {
  const ground = await findGroundBySlug('ss-cricket-ground')
  assert.ok(ground, 'the real ground must exist')
  assert.equal(ground.name, 'SS Cricket Ground')
  assert.equal(ground.city, 'Baliawas')
  assert.equal(ground.state, 'Haryana')
  assert.equal(ground.postal_code, '122101')
  assert.equal(ground.country, 'India')
  assert.equal(ground.status, 'ACTIVE')
  assert.match(ground.public_ground_id, /^GRD-/)
  // never a generic placeholder name
  assert.notEqual(ground.name, 'Ground 1')
  assert.notEqual(ground.name, 'Default Ground')
  assert.notEqual(ground.name, 'Test Ground')
})

test('the real canteen was seeded, belongs to the real ground', async () => {
  const ground = await findGroundBySlug('ss-cricket-ground')
  const canteens = await findCanteensByGroundId(ground.id)
  assert.equal(canteens.length, 1)
  assert.equal(canteens[0].ground_id, ground.id)
  assert.equal(canteens[0].name, 'Main Canteen')
  assert.equal(canteens[0].is_active, true)
  assert.match(canteens[0].public_canteen_id, /^CAN-/)
})

// Phase 8 — test-debt fix: this used to assert "exactly one ground exists
// in the whole database" as its idempotency check, which broke the moment
// ANY other ground was created (by a real second ground, or by test debris
// from other integration test files) — a fragile, overly-broad proxy for
// what this test actually verifies. seedGroundAndCanteen() itself is
// already correctly idempotent BY SLUG (findGroundBySlug, not "is there
// exactly one row") — confirmed by reading scripts/seedGroundAndCanteen.js
// directly, so this was purely a test bug, not a production one. Fixed to
// check the SPECIFIC seeded ground (by its own slug) before/after, which is
// what "idempotent" actually means here and holds regardless of how many
// unrelated grounds exist.
test('seedGroundAndCanteen() is idempotent: running it again returns the SAME rows, never duplicates', async () => {
  const before = await findGroundBySlug('ss-cricket-ground')
  assert.ok(before, 'sanity check: the real seeded ground exists before re-running the seed')

  const beforeCanteens = await findCanteensByGroundId(before.id)
  assert.equal(beforeCanteens.length, 1, 'sanity check: exactly one canteen for the seeded ground before re-running the seed')

  const result = await seedGroundAndCanteen()
  assert.equal(result.groundInserted, false, 'must not insert a second time')
  assert.equal(result.canteenInserted, false)
  assert.equal(result.ground.id, before.id, 'must return the SAME ground row, not a new one')
  assert.equal(result.canteen.id, beforeCanteens[0].id, 'must return the SAME canteen row, not a new one')

  const afterCanteens = await findCanteensByGroundId(before.id)
  assert.equal(afterCanteens.length, 1, 'still exactly one canteen for the seeded ground after re-running the seed')
})

test('grounds.slug is uniquely constrained at the database level', async () => {
  await assert.rejects(
    () =>
      createGround({
        publicGroundId: generatePublicId('GRD', 8),
        slug: 'ss-cricket-ground', // collides with the real seeded ground
        name: 'A Different Name',
      }),
    (err) => err.code === '23505',
    'a duplicate slug must be rejected by a real unique constraint, not just application logic',
  )
})

test('grounds.public_ground_id is uniquely constrained at the database level', async () => {
  const dupPublicId = generatePublicId('GRD', 8)
  const client = await pool.connect()
  let createdId = null
  try {
    const { rows } = await client.query(
      `INSERT INTO grounds (public_ground_id, slug, name) VALUES ($1,$2,$3) RETURNING id`,
      [dupPublicId, 'a-temporary-fixture-ground', 'Fixture Ground'],
    )
    createdId = rows[0].id

    await assert.rejects(
      () => client.query(`INSERT INTO grounds (public_ground_id, slug, name) VALUES ($1,$2,$3)`, [dupPublicId, 'a-different-slug', 'Another Name']),
      (err) => err.code === '23505',
    )
  } finally {
    if (createdId) await pool.query('DELETE FROM grounds WHERE id = $1', [createdId])
    client.release()
  }
})

test('canteens.ground_id enforces a real foreign key — cannot reference a nonexistent ground', async () => {
  await assert.rejects(
    () => createCanteen({ groundId: 999999999, publicCanteenId: generatePublicId('CAN', 8), name: 'Orphan Canteen' }),
    (err) => err.code === '23503', // foreign_key_violation
  )
})

test('deleting a ground cascades to delete its canteens (ON DELETE CASCADE)', async () => {
  const client = await pool.connect()
  try {
    const groundRes = await client.query(
      `INSERT INTO grounds (public_ground_id, slug, name) VALUES ($1,$2,$3) RETURNING id`,
      [generatePublicId('GRD', 8), 'cascade-test-ground', 'Cascade Test Ground'],
    )
    const groundId = groundRes.rows[0].id
    const canteen = await createCanteen({ groundId, publicCanteenId: generatePublicId('CAN', 8), name: 'Temp Canteen' })

    await client.query('DELETE FROM grounds WHERE id = $1', [groundId])

    const stillThere = await findCanteenById(canteen.id)
    assert.equal(stillThere, null, 'the canteen must be gone too — no orphaned row left behind')
  } finally {
    client.release()
  }
})

test('slugify produces the exact slug used for the real ground', () => {
  assert.equal(slugify('SS Cricket Ground'), 'ss-cricket-ground')
  assert.equal(slugify('  Café  Ground!! '), 'cafe-ground')
})

test('findGroundById returns the same row findGroundBySlug does', async () => {
  const bySlug = await findGroundBySlug('ss-cricket-ground')
  const byId = await findGroundById(bySlug.id)
  assert.deepEqual(byId, bySlug)
})
