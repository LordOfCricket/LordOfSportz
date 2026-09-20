// Umpire Reputation & Trust 2.0 — the 3 explicit end-to-end scenarios
// required by the task: (1) a brand-new umpire with zero history shows
// honest "not enough data" everywhere rather than a fabricated number, (2)
// an established umpire's every displayed metric traces exactly back to
// raw source rows (no drift between the reputation summary and the
// pre-existing self-profile stats, which are computed independently from
// the same tables), (3) after a no-show + replacement, credit transfers
// correctly — the original umpire earns no completed-match credit, the
// replacement does. Real DB state, no mocking.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import app from '../../app.js'
import { pool } from '../../config/db.js'
import { signToken } from '../../utils/jwt.js'
import { generatePublicId } from '../../utils/publicId.js'
import { createMembership } from '../../models/groundUser.model.js'
import * as matchService from '../../services/match.service.js'
import { recalculateUmpireRating } from '../../services/ratingAggregation.service.js'
import { buildReputationSummary } from '../../services/umpireReputation.service.js'
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
// umpire reputation scenarios).
async function elevate(user) {
  const { cookie } = await mintMfaVerifiedSessionCookie(user.id)
  user.cookie = cookie
  return user
}

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function approvedUmpire(label) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, player_type) VALUES ($1,$2,'not-a-real-hash','player','umpire') RETURNING *`,
    [`Integration Scenario ${label}`, `integration-test-repscenario-${label}-${uniqueTag()}@example.test`],
  )
  const user = rows[0]
  await pool.query(`INSERT INTO umpire_requests (user_id, status, decided_at) VALUES ($1, 'approved', NOW())`, [user.id])
  return {
    id: user.id,
    token: signToken({ id: user.id, name: user.name }),
    async cleanup() {
      await pool.query('DELETE FROM match_feedback_umpire_ratings WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_assignment_events WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE umpire_user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_profiles WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM umpire_requests WHERE user_id = $1', [user.id])
      await pool.query('DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}

async function makeTeams(tag) {
  const teamA = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RSA') RETURNING *`, [`Scenario Team A ${tag}`])).rows[0]
  const teamB = (await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1,'RSB') RETURNING *`, [`Scenario Team B ${tag}`])).rows[0]
  return {
    teamA,
    teamB,
    async cleanup() {
      await pool.query('DELETE FROM matches WHERE team_a_id = ANY($1) OR team_b_id = ANY($1)', [[teamA.id, teamB.id]])
      await pool.query('DELETE FROM teams WHERE id = ANY($1)', [[teamA.id, teamB.id]])
    },
  }
}

// Bulk-creates `count` already-completed matches (each with its own single
// umpire slot + a terminal umpire_assignment_events row) for `umpire`, all
// via set-based SQL rather than a per-match service-layer loop — this is
// test-fixture setup standing in for months of real officiating history, so
// looping matchService.createMatch 131 times would make this scenario slow
// without adding any coverage value.
async function bulkOfficiatedHistory(teams, umpire, { completed = 0, noShows = 0, cancellations = 0 }) {
  const total = completed + noShows + cancellations
  if (total === 0) return []
  const { rows: matchRows } = await pool.query(
    `INSERT INTO matches (team_a_id, team_b_id, match_date, status)
     SELECT $1, $2, NOW() - (gs || ' days')::interval, 'completed'
     FROM generate_series(1, $3) AS gs
     RETURNING id`,
    [teams.teamA.id, teams.teamB.id, total],
  )
  const matchIds = matchRows.map((r) => r.id)
  const kinds = [
    ...Array(completed).fill('COMPLETED'),
    ...Array(noShows).fill('NO_SHOW'),
    ...Array(cancellations).fill('CANCELLED'),
  ]
  const slotStatuses = kinds.map((k) => (k === 'COMPLETED' ? 'COMPLETED' : k))
  const { rows: slotRows } = await pool.query(
    `INSERT INTO match_umpire_slots (match_id, slot_number, status, umpire_user_id, assigned_at, completed_at)
     SELECT m, 1, s, $3, NOW(), CASE WHEN s = 'COMPLETED' THEN NOW() ELSE NULL END
     FROM unnest($1::int[]) WITH ORDINALITY AS a(m, ord)
     JOIN unnest($2::text[]) WITH ORDINALITY AS b(s, ord) USING (ord)
     RETURNING id, match_id`,
    [matchIds, slotStatuses, umpire.id],
  )
  await pool.query(
    `INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type)
     SELECT s, m, $3, k
     FROM unnest($1::int[]) WITH ORDINALITY AS a(s, ord)
     JOIN unnest($2::int[]) WITH ORDINALITY AS b(m, ord) USING (ord)
     JOIN unnest($4::text[]) WITH ORDINALITY AS c(k, ord) USING (ord)`,
    [slotRows.map((r) => r.id), slotRows.map((r) => r.match_id), umpire.id, kinds],
  )
  return matchIds
}

// Bulk-creates `ratings.length` distinct match_feedback rows (one per
// reviewer, all against a single throwaway match) plus their
// match_feedback_umpire_ratings children, then recomputes the cached
// umpire_profiles aggregate exactly the way a real submission would
// (ratingAggregation.service.js) — never hand-writing rating_avg/
// rating_count directly.
async function bulkRatings(teams, umpire, ratings) {
  const match = await matchService.createMatch({
    teamAId: teams.teamA.id,
    teamBId: teams.teamB.id,
    matchDate: new Date(Date.now() - 86400000).toISOString(),
    oversPerInnings: 20,
    requiredUmpires: 1,
  })
  const { rows: reviewerRows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     SELECT 'Integration Reviewer ' || gs, 'integration-test-reviewer-' || gs || '-' || $1 || '@example.test', 'not-a-real-hash', 'player'
     FROM generate_series(1, $2) AS gs
     RETURNING id`,
    [uniqueTag(), ratings.length],
  )
  const reviewerIds = reviewerRows.map((r) => r.id)
  const { rows: feedbackRows } = await pool.query(
    `INSERT INTO match_feedback (match_id, submitted_by, ground_rating, app_rating)
     SELECT $1, r, 5, 5 FROM unnest($2::int[]) AS r
     RETURNING id`,
    [match.id, reviewerIds],
  )
  await pool.query(
    `INSERT INTO match_feedback_umpire_ratings (match_feedback_id, umpire_user_id, rating)
     SELECT f, $2, r
     FROM unnest($1::int[]) WITH ORDINALITY AS a(f, ord)
     JOIN unnest($3::int[]) WITH ORDINALITY AS b(r, ord) USING (ord)`,
    [feedbackRows.map((r) => r.id), umpire.id, ratings],
  )
  await recalculateUmpireRating(umpire.id)
  return {
    reviewerIds,
    matchId: match.id,
    async cleanup() {
      await pool.query('DELETE FROM match_feedback WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [match.id])
      await pool.query('DELETE FROM matches WHERE id = $1', [match.id])
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [reviewerIds])
    },
  }
}

test('Scenario 1 — a brand-new umpire with zero officiating/review history shows honest "not enough data", never a fabricated number', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('scenario1-new')
  try {
    const res = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const p = res.data.profile
    assert.equal(p.verified, true, 'approved umpires are verified even with zero matches')
    assert.equal(p.matches_officiated, 0)
    assert.equal(p.reliability, null, 'no terminal history yet — never a fabricated percentage')
    assert.equal(p.rating_count, 0)
    assert.equal(p.rating_avg, null)
    assert.deepEqual(p.badges, [], 'no badge can be earned with zero sample size, regardless of thresholds')
    assert.deepEqual(p.recentRatings, [], 'empty trend data — client renders "Not enough data yet", never a fake trend line')
  } finally {
    await umpire.cleanup()
    await server.close()
  }
})

test('Scenario 2 — an established umpire (126 completed, 2 no-shows, 3 cancellations, 126 reviews): every displayed metric matches the raw source data exactly', async () => {
  const server = await startTestApp()
  const umpire = await approvedUmpire('scenario2-established')
  const tag = uniqueTag()
  const teams = await makeTeams(tag)
  let ratingsFixture
  try {
    await bulkOfficiatedHistory(teams, umpire, { completed: 126, noShows: 2, cancellations: 3 })
    // 100 five-star + 26 four-star reviews -> avg = 604/126 = 4.79(...),
    // stored as NUMERIC(3,2) -> 4.79 exactly.
    const ratings = [...Array(100).fill(5), ...Array(26).fill(4)]
    ratingsFixture = await bulkRatings(teams, umpire, ratings)

    const res = await json(`${server.baseUrl}/umpire/profile`, { token: umpire.token })
    assert.equal(res.status, 200, JSON.stringify(res.data))
    const p = res.data.profile

    assert.equal(p.matches_officiated, 126, 'matches officiated must equal the real completed-slot count, not an estimate')
    assert.equal(p.matches_no_show, 2)
    assert.equal(p.matches_cancelled, 3)
    // completed/(completed+noShows+cancellations) = 126/131 = 96.18...% -> 96
    assert.equal(p.reliability, 96)
    assert.equal(p.rating_count, 126)
    assert.equal(Number(p.rating_avg), 4.79)

    // Badge thresholds, verified against the same raw numbers:
    // HIGHLY_RELIABLE (reliability>=95 & officiated>=10), TOP_RATED
    // (avg>=4.7 & reviews>=10), EXPERIENCED_OFFICIAL (officiated>=50) — all
    // three genuinely earned by this exact data, not assumed.
    assert.deepEqual(p.badges.slice().sort(), ['EXPERIENCED_OFFICIAL', 'HIGHLY_RELIABLE', 'TOP_RATED'].sort())

    // The reputation-summary builder (used by ground-owner-facing views) is
    // computed independently from the same source tables — must agree with
    // the self-profile numbers above exactly, with zero drift between the
    // two call paths.
    const summary = await buildReputationSummary(umpire.id)
    assert.equal(summary.matchesOfficiated, 126)
    assert.equal(summary.noShows, 2)
    assert.equal(summary.cancellations, 3)
    assert.equal(summary.reliability, 96)
    assert.equal(summary.ratingCount, 126)
    assert.equal(summary.ratingAvg, 4.79)
  } finally {
    if (ratingsFixture) await ratingsFixture.cleanup()
    await umpire.cleanup()
    await teams.cleanup()
    await server.close()
  }
})

test('Scenario 3 — no-show + replacement: the original umpire earns no completed-match credit, the replacement does', async () => {
  const server = await startTestApp()
  const gf = { ground: null }
  const owner = await approvedUmpire('scenario3-owner') // just needs a real user; not actually an umpire here
  const umpireA = await approvedUmpire('scenario3-original')
  const umpireB = await approvedUmpire('scenario3-replacement')
  const tag = uniqueTag()
  const teams = await makeTeams(tag)
  let matchId
  try {
    const groundRows = (
      await pool.query(`INSERT INTO grounds (public_ground_id, slug, name, status) VALUES ($1,$2,$3,'ACTIVE') RETURNING *`, [
        generatePublicId('GRD', 8),
        `integration-test-repscenario-ground-${tag}`,
        `Integration Test Scenario Ground ${tag}`,
      ])
    ).rows
    gf.ground = groundRows[0]
    await createMembership({ groundId: gf.ground.id, userId: owner.id, role: 'GROUND_OWNER' })
    await elevate(owner)

    const match = await matchService.createMatch({
      teamAId: teams.teamA.id,
      teamBId: teams.teamB.id,
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      groundId: gf.ground.id,
      requiredUmpires: 1,
    })
    matchId = match.id

    const applied = await json(`${server.baseUrl}/matches/${matchId}/umpire-slots/apply`, { method: 'POST', token: umpireA.token })
    assert.equal(applied.status, 201, JSON.stringify(applied.data))
    const slotId = applied.data.slot.id

    // A no-shows.
    const noShow = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/no-show`,
      { method: 'POST', cookie: owner.cookie },
    )
    assert.equal(noShow.status, 200, JSON.stringify(noShow.data))

    // Ground owner assigns B as the replacement.
    const replace = await json(
      `${server.baseUrl}/ground-owner/grounds/${gf.ground.public_ground_id}/matches/${matchId}/umpire-slots/${slotId}/replace`,
      { method: 'POST', cookie: owner.cookie, body: { newUmpireUserId: umpireB.id } },
    )
    assert.equal(replace.status, 200, JSON.stringify(replace.data))

    // The match completes with B holding the slot.
    await pool.query(`UPDATE match_umpire_slots SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`, [slotId])
    await pool.query(
      `INSERT INTO umpire_assignment_events (match_umpire_slot_id, match_id, umpire_user_id, event_type) VALUES ($1, $2, $3, 'COMPLETED')`,
      [slotId, matchId, umpireB.id],
    )
    await pool.query(`UPDATE matches SET status = 'completed' WHERE id = $1`, [matchId])

    const summaryA = await buildReputationSummary(umpireA.id)
    const summaryB = await buildReputationSummary(umpireB.id)

    assert.equal(summaryA.matchesOfficiated, 0, 'A never completed this match — no credit for a match they no-showed')
    assert.equal(summaryA.noShows, 1)
    assert.equal(summaryB.matchesOfficiated, 1, 'B actually officiated the completed match — must get the credit')
    assert.equal(summaryB.noShows, 0)
  } finally {
    if (matchId) {
      await pool.query('DELETE FROM umpire_assignment_events WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM match_umpire_slots WHERE match_id = $1', [matchId])
      await pool.query('DELETE FROM ground_notifications WHERE related_match_id = $1', [matchId])
      await pool.query('DELETE FROM matches WHERE id = $1', [matchId])
    }
    await pool.query('DELETE FROM ground_users WHERE user_id = $1', [owner.id])
    if (gf.ground) await pool.query('DELETE FROM grounds WHERE id = $1', [gf.ground.id])
    await umpireA.cleanup()
    await umpireB.cleanup()
    await owner.cleanup()
    await teams.cleanup()
    await server.close()
  }
})
