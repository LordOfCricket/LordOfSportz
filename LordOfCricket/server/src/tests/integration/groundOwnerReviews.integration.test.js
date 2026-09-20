// Phase 13 — Ground Reviews & Ratings Display. Verifies the existing
// match_feedback/rating_avg/rating_count data (captured by the U6 post-match
// feedback flow, aggregated by ratingAggregation.service.js) is correctly
// surfaced via: (a) public ground responses (numeric rating only), and
// (b) the Ground Owner's own reviews list (rating + comments, anonymous).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { recalculateGroundRating } from '../../services/ratingAggregation.service.js'
import { mintMfaVerifiedSessionCookie } from './helpers/mfaFixtures.js'

async function startTestApp() {
  const httpServer = http.createServer(app)
  app.locals.io = { emit: () => {}, to: () => ({ emit: () => {} }) }
  await new Promise((resolve) => httpServer.listen(0, resolve))
  const port = httpServer.address().port
  return { baseUrl: `http://localhost:${port}/api`, async close() { await new Promise((r) => httpServer.close(r)) } }
}

const uniqueTag = () => Math.random().toString(36).slice(2, 10)

async function createUser(label, { role = 'player' } = {}) {
  const tag = uniqueTag()
  const email = `reviews-${label}-${tag}@example.test`
  const user = (
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,'not-a-real-hash',$3) RETURNING *`,
      [`Integration Test ${label}`, email, role],
    )
  ).rows[0]
  return {
    id: user.id,
    email,
    token: signToken({ id: user.id }),
    async cleanup() {
      await pool.query('DELETE FROM ground_users WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

function cauth(user) {
  return { Cookie: user.cookie, 'Content-Type': 'application/json' }
}

async function createOwnedGround(userId, label) {
  const tag = uniqueTag()
  const { rows: [ground] } = await pool.query(
    `INSERT INTO grounds (public_ground_id, slug, name, description, status) VALUES ($1, $2, $3, $4, 'ACTIVE') RETURNING *`,
    [generatePublicId('GRD', 8), `reviews-ground-${tag}`, label, 'Test ground for reviews'],
  )
  await pool.query(`INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1, $2, 'GROUND_OWNER', true)`, [userId, ground.id])
  return ground
}

async function makeTeams() {
  const tag = uniqueTag()
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RVA') RETURNING *`, [`Reviews Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RVB') RETURNING *`, [`Reviews Team B ${tag}`])).rows[0]
  return { teamA, teamB }
}

// Direct-insert fixture (not the full submission HTTP flow — that's already
// covered by matchFeedback.integration.test.js; this phase is about the
// READ side of already-captured data). Creates a real match tied to the
// ground, then real match_feedback rows with a real ground_rating, then
// recomputes grounds.rating_avg/rating_count exactly the way
// submitFeedback's own transaction would.
async function seedGroundReviews(groundId, ratings) {
  const { teamA, teamB } = await makeTeams()
  const { rows: [match] } = await pool.query(
    `INSERT INTO matches (team_a_id, team_b_id, match_date, status, ground_id) VALUES ($1,$2,NOW(),'completed',$3) RETURNING *`,
    [teamA.id, teamB.id, groundId],
  )
  const submitters = []
  for (const r of ratings) {
    const submitter = await createUser(`submitter-${uniqueTag()}`)
    submitters.push(submitter)
    await pool.query(
      `INSERT INTO match_feedback (match_id, submitted_by, ground_rating, ground_comment_liked, ground_comment_improve, app_rating)
       VALUES ($1,$2,$3,$4,$5,5)`,
      [match.id, submitter.id, r.rating, r.liked || null, r.improve || null],
    )
  }
  await recalculateGroundRating(groundId)
  return {
    match,
    teams: [teamA, teamB],
    async cleanup() {
      await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
      for (const s of submitters) await s.cleanup()
    },
  }
}

// ---------------------------------------------------------------------------
// Public rating display
// ---------------------------------------------------------------------------

test('1 — public ground detail (GET /grounds/:id) returns real ratingAvg/ratingCount', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner1')
    const ground = await createOwnedGround(owner.id, 'Rated Ground')
    const fx = await seedGroundReviews(ground.id, [{ rating: 5 }, { rating: 4 }, { rating: 3 }])

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.ratingCount, 3)
    assert.strictEqual(data.ground.ratingAvg, 4) // (5+4+3)/3 = 4.00
    assert.strictEqual(typeof data.ground.ratingAvg, 'number')

    await fx.cleanup()
    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('2 — public ground with zero reviews returns the honest zero state, never a fabricated rating', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner2')
    const ground = await createOwnedGround(owner.id, 'Unrated Ground')

    const res = await fetch(`${server.baseUrl}/grounds/${ground.public_ground_id}`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.ground.ratingCount, 0)
    assert.strictEqual(data.ground.ratingAvg, null)

    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('12 — no regression: existing public ground browse-all API still returns correctly shaped grounds (with rating fields added)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner12')
    const ground = await createOwnedGround(owner.id, 'Browse Ground')

    const res = await fetch(`${server.baseUrl}/grounds?limit=50`)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.ok(Array.isArray(data.grounds))
    const found = data.grounds.find((g) => g.publicGroundId === ground.public_ground_id)
    assert.ok(found, 'newly created ground should appear in browse-all listing')
    assert.strictEqual(found.ratingCount, 0)
    assert.strictEqual(found.ratingAvg, null)
    assert.ok('name' in found && 'city' in found && 'amenities' in found, 'existing fields must still be present')

    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

// ---------------------------------------------------------------------------
// Ground Owner reviews endpoint
// ---------------------------------------------------------------------------

test('3 — owner can list their own ground reviews, including written comments', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner3')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Reviewed Ground')
    const fx = await seedGroundReviews(ground.id, [{ rating: 5, liked: 'Great pitch', improve: 'More parking' }])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.reviews.length, 1)
    assert.strictEqual(data.reviews[0].rating, 5)
    // Test 9 — written review data available to authorized owner
    assert.strictEqual(data.reviews[0].commentLiked, 'Great pitch')
    assert.strictEqual(data.reviews[0].commentImprove, 'More parking')
    assert.ok(data.reviews[0].submittedAt)
    assert.strictEqual(data.pagination.total, 1)

    await fx.cleanup()
    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('10 — reviewer identity is never exposed (no user id, name, email, or phone in the response)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner10')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Anon Ground')
    const fx = await seedGroundReviews(ground.id, [{ rating: 4, liked: 'Nice ground' }])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(owner) })
    const data = await res.json()
    const review = data.reviews[0]
    const keys = Object.keys(review)
    assert.deepStrictEqual(keys.sort(), ['commentImprove', 'commentLiked', 'rating', 'submittedAt'])
    const serialized = JSON.stringify(review)
    assert.ok(!serialized.includes('@'), 'no email should ever appear in a review payload')
    assert.ok(!('submittedBy' in review) && !('userId' in review) && !('email' in review) && !('phone' in review))

    await fx.cleanup()
    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('4/11 — owner A cannot list owner B ground reviews (ground isolation)', async (t) => {
  const server = await startTestApp()
  try {
    const ownerA = await createUser('ownerA4')
    await elevate(ownerA)
    const ownerB = await createUser('ownerB4')
    await elevate(ownerB)
    const groundB = await createOwnedGround(ownerB.id, 'Owner B Ground')
    const fx = await seedGroundReviews(groundB.id, [{ rating: 5 }])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${groundB.public_ground_id}/reviews`, { headers: cauth(ownerA) })
    assert.strictEqual(res.status, 403)

    await fx.cleanup()
    await ownerA.cleanup()
    await ownerB.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [groundB.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [groundB.id])
  } finally {
    await server.close()
  }
})

test('5 — non-owner (player with no ground membership) rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner5')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground5')

    const stranger = await createUser('stranger5')
    await elevate(stranger)

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(stranger) })
    assert.strictEqual(res.status, 403)

    await owner.cleanup()
    await stranger.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('6 — unauthenticated request rejected', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner6')
    const ground = await createOwnedGround(owner.id, 'Ground6')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`)
    assert.strictEqual(res.status, 401)

    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('7/8 — pagination works and bounds are validated', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner7')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Ground7')
    const fx = await seedGroundReviews(ground.id, [{ rating: 5 }, { rating: 4 }, { rating: 3 }])

    // Page 1, limit 2 — 2 results, totalPages 2
    const res1 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews?page=1&limit=2`, { headers: cauth(owner) })
    const data1 = await res1.json()
    assert.strictEqual(data1.reviews.length, 2)
    assert.strictEqual(data1.pagination.total, 3)
    assert.strictEqual(data1.pagination.totalPages, 2)

    // Page 2, limit 2 — 1 remaining result
    const res2 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews?page=2&limit=2`, { headers: cauth(owner) })
    const data2 = await res2.json()
    assert.strictEqual(data2.reviews.length, 1)

    // Bounds: an absurd limit is clamped, never trusted verbatim for SQL LIMIT
    const res3 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews?limit=999999`, { headers: cauth(owner) })
    const data3 = await res3.json()
    assert.ok(data3.pagination.limit <= 50, 'limit must be clamped to a safe maximum')

    // Bounds: a negative/zero page is clamped to page 1, never a negative OFFSET
    const res4 = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews?page=-5`, { headers: cauth(owner) })
    assert.strictEqual(res4.status, 200)
    const data4 = await res4.json()
    assert.strictEqual(data4.pagination.page, 1)

    await fx.cleanup()
    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('owner with zero reviews sees an empty, honest list (not an error)', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-empty')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Empty Ground')

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(owner) })
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.deepStrictEqual(data.reviews, [])
    assert.strictEqual(data.pagination.total, 0)

    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('reviews are newest-first', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-order')
    await elevate(owner)
    const ground = await createOwnedGround(owner.id, 'Order Ground')
    const fx1 = await seedGroundReviews(ground.id, [{ rating: 1 }])
    await new Promise((r) => setTimeout(r, 20))
    const fx2 = await seedGroundReviews(ground.id, [{ rating: 5 }])

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(owner) })
    const data = await res.json()
    assert.strictEqual(data.reviews[0].rating, 5, 'the most recently submitted review must come first')
    assert.strictEqual(data.reviews[1].rating, 1)

    await fx2.cleanup()
    await fx1.cleanup()
    await owner.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})

test('privilege escalation: a fully-permissioned GROUND_ADMIN staff member still cannot read owner reviews', async (t) => {
  const server = await startTestApp()
  try {
    const owner = await createUser('owner-esc')
    const staff = await createUser('staff-esc')
    await elevate(staff)
    const ground = await createOwnedGround(owner.id, 'Escalation Ground')

    const { rows: [membership] } = await pool.query(
      `INSERT INTO ground_users (user_id, ground_id, role, is_active) VALUES ($1,$2,'GROUND_ADMIN',true) RETURNING *`,
      [staff.id, ground.id],
    )
    const perms = (await pool.query(`SELECT id FROM permissions WHERE is_active = true`)).rows
    for (const p of perms) {
      await pool.query(`INSERT INTO staff_permissions (ground_user_id, permission_id, granted_by) VALUES ($1,$2,$3)`, [membership.id, p.id, owner.id])
    }

    const res = await fetch(`${server.baseUrl}/ground-owner/grounds/${ground.public_ground_id}/reviews`, { headers: cauth(staff) })
    assert.strictEqual(res.status, 403, 'reviews are Owner-only — no staff permission should ever grant access')

    await pool.query('DELETE FROM staff_permissions WHERE ground_user_id = $1', [membership.id])
    await owner.cleanup()
    await staff.cleanup()
    await pool.query('DELETE FROM ground_users WHERE ground_id = $1', [ground.id])
    await pool.query('DELETE FROM grounds WHERE id = $1', [ground.id])
  } finally {
    await server.close()
  }
})
