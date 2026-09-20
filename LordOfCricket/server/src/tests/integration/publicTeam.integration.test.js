// Phase 10 Part 2 — public team ecosystem, proved against real PostgreSQL
// through the actual service layer. Same service-level pattern as Phase 9/10
// Part 1's integration tests (no HTTP; controllers/routes are a thin
// pass-through already covered by manual E2E).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as statisticsService from '../../services/statistics.service.js'
import * as matchSummaryService from '../../services/matchSummary.service.js'
import * as publicTeamService from '../../services/publicTeam.service.js'
import { updatePlayer } from '../../models/player.model.js'
import { createTeamsFixture, playShortFinalizedMatch, bowl, bowlDots } from './fixtures.js'

async function seatXi(fx, matchId, squad, teamId, squadSize = 4) {
  const mps = []
  for (const p of squad.slice(0, squadSize)) mps.push(await scoringService.addMatchPlayer({ matchId, teamId, playerId: p.id, isPlayingXi: true }))
  return mps
}

/** A minimal 1-over-per-innings match so a single bowler per side is enough
 * (no same-bowler-two-overs-in-a-row concern) — used for the deterministic
 * scoring scenarios below. */
async function playOneOverMatch(fx, { battingA, battingB, bowlingA, bowlingB, aRuns, bRuns, tossWinnerId = fx.teamAId, tossDecision = 'bat' }) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Integration Test Ground', matchDate: new Date().toISOString(), oversPerInnings: 1, ballsPerOver: 6 })
  const mpsA = await seatXi(fx, match.id, battingA, fx.teamAId, battingA.length)
  const mpsB = await seatXi(fx, match.id, battingB, fx.teamBId, battingB.length)
  await matchService.setToss(match.id, { tossWinnerId, tossDecision })
  const started = await matchService.startMatch(match.id)

  const battingTeamId = matchService.battingTeamFromToss(started)
  const firstBatSquad = battingTeamId === fx.teamAId ? mpsA : mpsB
  const firstBowlSquad = battingTeamId === fx.teamAId ? mpsB : mpsA
  const secondBatSquad = battingTeamId === fx.teamAId ? mpsB : mpsA
  const secondBowlSquad = battingTeamId === fx.teamAId ? mpsA : mpsB
  const firstRuns = battingTeamId === fx.teamAId ? aRuns : bRuns
  const secondRuns = battingTeamId === fx.teamAId ? bRuns : aRuns

  const innings1 = await scoringService.createInnings({
    matchId: match.id,
    inningsNumber: 1,
    battingTeamId,
    bowlingTeamId: battingTeamId === fx.teamAId ? fx.teamBId : fx.teamAId,
  })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: firstBatSquad[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: firstBatSquad[1].id } } })
  for (const r of firstRuns) await bowl(innings1.id, firstBowlSquad[0], { batRuns: r })
  while ((await scoringService.getInningsState(innings1.id)).state.legalBalls < 6) await bowl(innings1.id, firstBowlSquad[0], { batRuns: 0 })

  const innings2 = await scoringService.createInnings({
    matchId: match.id,
    inningsNumber: 2,
    battingTeamId: battingTeamId === fx.teamAId ? fx.teamBId : fx.teamAId,
    bowlingTeamId: battingTeamId,
  })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: secondBatSquad[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: secondBatSquad[1].id } } })
  for (const r of secondRuns) await bowl(innings2.id, secondBowlSquad[0], { batRuns: r })
  while ((await scoringService.getInningsState(innings2.id)).state.legalBalls < 6) await bowl(innings2.id, secondBowlSquad[0], { batRuns: 0 })

  const finalized = await matchService.finalizeMatch(match.id)
  return { matchId: match.id, match: finalized, mpsA, mpsB }
}

test('T1 — team listing: search is case-insensitive substring, empty search behaves like normal listing', async () => {
  const fx = await createTeamsFixture({ squadSize: 2 })
  try {
    const all = await publicTeamService.listPublicTeams({ search: '', limit: 50, offset: 0 })
    assert.ok(all.items.some((t) => t.id === fx.teamAId))

    const found = await publicTeamService.listPublicTeams({ search: 'integration test match a', limit: 50, offset: 0 })
    assert.ok(found.items.some((t) => t.id === fx.teamAId))

    const foundPartialLower = await publicTeamService.listPublicTeams({ search: 'match a', limit: 50, offset: 0 })
    assert.ok(foundPartialLower.items.some((t) => t.id === fx.teamAId))

    const noResults = await publicTeamService.listPublicTeams({ search: 'zzz-no-such-team-zzz', limit: 50, offset: 0 })
    assert.deepEqual(noResults.items, [])
  } finally {
    await fx.cleanup()
  }
})

test('T2/P59/P117 — invalid or nonexistent team id returns a structured 404, never a 500', async () => {
  await assert.rejects(() => publicTeamService.getPublicTeamProfile('not-a-number'), (err) => err.statusCode === 404)
  await assert.rejects(() => publicTeamService.getPublicTeamProfile('999999999'), (err) => err.statusCode === 404)
})

test('T4/P12/P13/P61/P62/P63/P64 — a brand-new team with zero players and zero matches loads gracefully', async () => {
  const { rows } = await pool.query(`INSERT INTO teams (name, short_name) VALUES ('Integration Test New Team', 'ITN') RETURNING *`)
  const team = rows[0]
  try {
    const profile = await publicTeamService.getPublicTeamProfile(team.id)
    assert.deepEqual(profile.squad, [])
    assert.deepEqual(profile.record, { matches: 0, wins: 0, losses: 0, ties: 0, noResults: 0, winPercentage: null })
    assert.deepEqual(profile.recentForm, [])
    assert.equal(profile.liveMatch, null)
    assert.deepEqual(profile.upcomingFixtures, [])
    assert.deepEqual(profile.recentMatches, [])
    assert.deepEqual(profile.topPerformers, { topRunScorer: null, topWicketTaker: null })
  } finally {
    await pool.query('DELETE FROM teams WHERE id = $1', [team.id])
  }
})

test('T3/P9/P44 — team card counts (matchCount/wins/squadCount) reflect finalized-only + current membership', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    const listing = await publicTeamService.listPublicTeams({ search: 'Integration Test Match', limit: 50, offset: 0 })
    const cardA = listing.items.find((t) => t.id === fx.teamAId)
    const cardB = listing.items.find((t) => t.id === fx.teamBId)
    assert.equal(cardA.matchCount, 1)
    assert.equal(cardA.wins, 1)
    assert.equal(cardA.losses, 0)
    assert.equal(cardA.squadCount, fx.squadA.length)
    assert.equal(cardB.matchCount, 1)
    assert.equal(cardB.wins, 0)
    assert.equal(cardB.losses, 1)
  } finally {
    await fx.cleanup()
  }
})

test('T5/P21/P22/P24/P103/P104 — finalized win/loss record for a known fixture, correct win percentage both sides', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // playShortFinalizedMatch is deterministic: team A always wins by runs.
    await playShortFinalizedMatch(fx, { finalize: true })

    const teamAProfile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.deepEqual(teamAProfile.record, { matches: 1, wins: 1, losses: 0, ties: 0, noResults: 0, winPercentage: 100 })

    const teamBProfile = await publicTeamService.getPublicTeamProfile(fx.teamBId)
    assert.deepEqual(teamBProfile.record, { matches: 1, wins: 0, losses: 1, ties: 0, noResults: 0, winPercentage: 0 })
  } finally {
    await fx.cleanup()
  }
})

test('T6/P19/P93/P105 — a completed-but-unfinalized match never alters the official team record', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx, { finalize: false })
    const before = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.equal(before.record.matches, 0, 'a completed-but-unfinalized match must not count toward the official record')
    // but it IS visible as a recent match preview (Part 1's RESULTS category includes completed+finalized)
    assert.ok(before.recentMatches.some((m) => m.id === matchId))

    await matchService.finalizeMatch(matchId)
    const after = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.equal(after.record.matches, 1, 'finalizing must immediately update the official record with no manual step')
    assert.equal(after.record.wins, 1)
  } finally {
    await fx.cleanup()
  }
})

test('T7/P19/P27/P106 — an upcoming fixture appears under upcomingFixtures and never affects the record', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const upcoming = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      venue: 'Integration Test Ground',
      matchDate: new Date(Date.now() + 86400000).toISOString(),
      oversPerInnings: 20,
      ballsPerOver: 6,
    })
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.ok(profile.upcomingFixtures.some((m) => m.id === upcoming.id))
    assert.equal(profile.record.matches, 0)
  } finally {
    await fx.cleanup()
  }
})

test('T8/P19/P28/P107 — a live match appears in the liveMatch slot and never affects the record', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Integration Test Ground', matchDate: new Date().toISOString(), oversPerInnings: 4, ballsPerOver: 6 })
    const mpsA = await seatXi(fx, match.id, fx.squadA, fx.teamAId)
    await seatXi(fx, match.id, fx.squadB, fx.teamBId)
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.ok(profile.liveMatch)
    assert.equal(profile.liveMatch.id, match.id)
    assert.equal(profile.record.matches, 0)
  } finally {
    await fx.cleanup()
  }
})

test('T9/P25/P108 — recent form shows correct newest-first W/L for known fixtures', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true }) // team A wins
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.equal(profile.recentForm[0].result, 'W')
    const profileB = await publicTeamService.getPublicTeamProfile(fx.teamBId)
    assert.equal(profileB.recentForm[0].result, 'L')
  } finally {
    await fx.cleanup()
  }
})

test('T10/P97/P98 — top run scorer / top wicket taker match a manually-verified known scripted match', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // Team A bats first: opener 1 scores 4+4+2=10, opener 2 scores 0s; team B all dots.
    await playOneOverMatch(fx, {
      battingA: fx.squadA,
      battingB: fx.squadB,
      aRuns: [4, 4, 2],
      bRuns: [0, 0, 0],
      tossWinnerId: fx.teamAId,
      tossDecision: 'bat',
    })
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.ok(profile.topPerformers.topRunScorer)
    assert.equal(profile.topPerformers.topRunScorer.runs, 10)
    assert.equal(profile.topPerformers.topRunScorer.player.name, fx.squadA[0].name)
    // The bowler who conceded 0 runs off 6 legal balls and took no wickets never
    // shows up as a top wicket taker (0 wickets is never an eligible winner).
    const profileB = await publicTeamService.getPublicTeamProfile(fx.teamBId)
    assert.equal(profileB.topPerformers.topWicketTaker, null)
  } finally {
    await fx.cleanup()
  }
})

test('T11/P111/P112/P113 — CRITICAL: a transfer never rewrites historical team representation', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const player = fx.squadA[0] // "P"

    // Match 1: P plays for Team A (current membership at the time). Team A bats
    // first and P (opener) scores 10; Team B replies with all dots -> Team A wins.
    const match1 = await playOneOverMatch(fx, {
      battingA: fx.squadA,
      battingB: fx.squadB,
      aRuns: [4, 4, 2],
      bRuns: [0, 0, 0],
      tossWinnerId: fx.teamAId,
      tossDecision: 'bat',
    })

    // P transfers: current membership now Team B.
    await updatePlayer(player.id, { team_id: fx.teamBId })

    // Match 2: P now plays FOR Team B (added to team B's roster this match).
    // Team A fields its remaining 3 squad members (still >= MIN_PLAYING_XI).
    // Team B bats first, P (opener) scores 15; Team A replies with all dots ->
    // Team B wins this time.
    const matchTwo = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Integration Test Ground', matchDate: new Date().toISOString(), oversPerInnings: 1, ballsPerOver: 6 })
    const mpsA2 = await seatXi(fx, matchTwo.id, fx.squadA.slice(1), fx.teamAId, 3)
    const mpsB2 = []
    mpsB2.push(await scoringService.addMatchPlayer({ matchId: matchTwo.id, teamId: fx.teamBId, playerId: player.id, isPlayingXi: true }))
    for (const p of fx.squadB.slice(0, 3)) mpsB2.push(await scoringService.addMatchPlayer({ matchId: matchTwo.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(matchTwo.id, { tossWinnerId: fx.teamBId, tossDecision: 'bat' })
    await matchService.startMatch(matchTwo.id)
    const m2innings1 = await scoringService.createInnings({ matchId: matchTwo.id, inningsNumber: 1, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    await scoringService.recordEvent({ inningsId: m2innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB2[0].id } } })
    await scoringService.recordEvent({ inningsId: m2innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB2[1].id } } })
    for (const r of [6, 6, 3]) await bowl(m2innings1.id, mpsA2[0], { batRuns: r })
    while ((await scoringService.getInningsState(m2innings1.id)).state.legalBalls < 6) await bowl(m2innings1.id, mpsA2[0], { batRuns: 0 })
    const m2innings2 = await scoringService.createInnings({ matchId: matchTwo.id, inningsNumber: 2, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: m2innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA2[0].id } } })
    await scoringService.recordEvent({ inningsId: m2innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA2[1].id } } })
    for (let i = 0; i < 6; i++) await bowl(m2innings2.id, mpsB2[0], { batRuns: 0 })
    await matchService.finalizeMatch(matchTwo.id)

    // --- Team A: only match 1's 10 runs credited to P; P no longer in current squad ---
    const teamAProfile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    assert.equal(teamAProfile.topPerformers.topRunScorer.player.publicPlayerId, player.public_player_id)
    assert.equal(teamAProfile.topPerformers.topRunScorer.runs, 10, "Team A's historical credit for P must be ONLY the 10 runs scored while representing Team A")
    assert.ok(!teamAProfile.squad.some((s) => s.publicPlayerId === player.public_player_id), 'P must no longer appear in Team A current squad after transferring')

    // --- Team B: only match 2's 15 runs credited to P; P now in current squad ---
    const teamBProfile = await publicTeamService.getPublicTeamProfile(fx.teamBId)
    assert.equal(teamBProfile.topPerformers.topRunScorer.player.publicPlayerId, player.public_player_id)
    assert.equal(teamBProfile.topPerformers.topRunScorer.runs, 15, "Team B's historical credit for P must be ONLY the 15 runs scored while representing Team B")
    assert.ok(teamBProfile.squad.some((s) => s.publicPlayerId === player.public_player_id), 'P must appear in Team B current squad after transferring')

    // --- Historical Match Summary for match 1 must still show P under TEAM A's Playing XI (Part 113) ---
    const summary1 = await matchSummaryService.getMatchSummary(match1.matchId)
    const allTeamAPlayers = summary1.playingXi.teamA.map((e) => e.player.publicPlayerId)
    assert.ok(allTeamAPlayers.includes(player.public_player_id), "match 1's historical Playing XI for Team A must still list P, unaffected by the later transfer")

    // --- P's own combined career includes BOTH matches (Part 40's last line) ---
    const career = await statisticsService.getPlayerCareerStats(player.id)
    assert.equal(career.career.matches, 2)
    assert.equal(career.career.batting.runs, 25, "P's own career combines both teams' matches (10 + 15)")
  } finally {
    await fx.cleanup()
  }
})

test('T12/P49/P50/P115 — public team responses never leak email/user_id/password/canteen data', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    const listing = await publicTeamService.listPublicTeams({ search: 'Integration Test Match', limit: 50, offset: 0 })
    const profile = await publicTeamService.getPublicTeamProfile(fx.teamAId)
    const blob = JSON.stringify({ listing, profile })
    for (const forbidden of ['@example', 'user_id', 'password', 'canteen', 'refresh_token', 'otp']) {
      assert.ok(!blob.toLowerCase().includes(forbidden.toLowerCase()), `response must never contain '${forbidden}'`)
    }
  } finally {
    await fx.cleanup()
  }
})

test('T14/P116 — team listing pagination is stable, no duplicate teams across adjacent pages', async () => {
  const page1 = await publicTeamService.listPublicTeams({ search: null, limit: 3, offset: 0 })
  const page2 = await publicTeamService.listPublicTeams({ search: null, limit: 3, offset: 3 })
  const ids1 = page1.items.map((t) => t.id)
  const ids2 = page2.items.map((t) => t.id)
  assert.equal(new Set([...ids1, ...ids2]).size, ids1.length + ids2.length)
  assert.equal(page1.pagination.total, page2.pagination.total)
})

// ---------------------------------------------------------------------------
// Pagination `total` correctness — team.repository.js#listPublicTeams bug fix.
//
// Deliberately scoped by a unique `search` term for every test below (never
// the global unscoped list the test above already covers) — the bug this
// fixes only became visible because a test's assumptions had an unstated
// dependency on how many teams happen to exist globally. Scoping every case
// here to its own uniquely-tagged team set makes the total this suite
// asserts against a value the test itself controls, not incidental
// database state, so these can never rot the same way again.
// ---------------------------------------------------------------------------

const uniqueTag = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function createPaginationTestTeams(tag, count) {
  const ids = []
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, '0')
    const row = (
      await pool.query(`INSERT INTO teams (name, short_name) VALUES ($1, $2) RETURNING id`, [`Pagination Test ${tag} ${n}`, `PGT${n}`])
    ).rows[0]
    ids.push(row.id)
  }
  return ids
}

async function cleanupPaginationTestTeams(ids) {
  if (ids.length === 0) return
  await pool.query('DELETE FROM teams WHERE id = ANY($1)', [ids])
}

test('pagination: first page returns the correct rows and the correct total', async () => {
  const tag = uniqueTag()
  const ids = await createPaginationTestTeams(tag, 5)
  try {
    const page = await publicTeamService.listPublicTeams({ search: `Pagination Test ${tag}`, limit: 2, offset: 0 })
    assert.equal(page.items.length, 2)
    assert.equal(page.pagination.total, 5)
    assert.deepEqual(page.items.map((t) => t.id), ids.slice(0, 2)) // ORDER BY name ASC, id ASC — deterministic
  } finally {
    await cleanupPaginationTestTeams(ids)
  }
})

test('pagination: a middle page returns the correct rows and the SAME total as the first page', async () => {
  const tag = uniqueTag()
  const ids = await createPaginationTestTeams(tag, 5)
  try {
    const page1 = await publicTeamService.listPublicTeams({ search: `Pagination Test ${tag}`, limit: 2, offset: 0 })
    const middle = await publicTeamService.listPublicTeams({ search: `Pagination Test ${tag}`, limit: 2, offset: 2 })
    assert.equal(middle.items.length, 2)
    assert.deepEqual(middle.items.map((t) => t.id), ids.slice(2, 4))
    assert.equal(middle.pagination.total, 5)
    assert.equal(middle.pagination.total, page1.pagination.total)
  } finally {
    await cleanupPaginationTestTeams(ids)
  }
})

// The critical regression test (this task's brief): OFFSET past the last
// matching row must still report the real total, not 0.
test('pagination: a page beyond the last page returns ZERO rows but the CORRECT total (regression test for the fixed bug)', async () => {
  const tag = uniqueTag()
  const ids = await createPaginationTestTeams(tag, 2)
  try {
    const beyond = await publicTeamService.listPublicTeams({ search: `Pagination Test ${tag}`, limit: 3, offset: 3 })
    assert.equal(beyond.items.length, 0)
    assert.equal(beyond.pagination.total, 2, 'total must reflect the 2 real matching teams, not the 0 rows this page happened to return')
  } finally {
    await cleanupPaginationTestTeams(ids)
  }
})

test('pagination: a search matching zero teams returns zero rows and total 0 (never a leftover/stale total)', async () => {
  const page = await publicTeamService.listPublicTeams({ search: `Pagination Test nonexistent-${uniqueTag()}`, limit: 10, offset: 0 })
  assert.equal(page.items.length, 0)
  assert.equal(page.pagination.total, 0)
})

test('pagination: limit/offset paging through every page collects each team exactly once, no duplicates or gaps', async () => {
  const tag = uniqueTag()
  const ids = await createPaginationTestTeams(tag, 7)
  try {
    const seen = []
    let offset = 0
    const limit = 3
    let total = null
    for (;;) {
      const page = await publicTeamService.listPublicTeams({ search: `Pagination Test ${tag}`, limit, offset })
      if (total === null) total = page.pagination.total
      assert.equal(page.pagination.total, total, 'total must stay constant across every page of the same query')
      if (page.items.length === 0) break
      seen.push(...page.items.map((t) => t.id))
      offset += limit
    }
    assert.equal(total, 7)
    assert.deepEqual(seen, ids) // every id, in order, exactly once
  } finally {
    await cleanupPaginationTestTeams(ids)
  }
})
