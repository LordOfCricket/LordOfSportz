// Phase 10 Part 1 — public match discovery, proved against real PostgreSQL
// through the actual service layer (matchService/scoringService build real
// matches; publicMatchService is the thing under test). No HTTP layer here —
// matchSummary.integration.test.js established the same service-level
// pattern for Phase 9, and controllers/routes are a thin pass-through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as matchSummaryService from '../../services/matchSummary.service.js'
import * as publicMatchService from '../../services/publicMatch.service.js'
import { createTeamsFixture, bowl, bowlDots, playShortFinalizedMatch } from './fixtures.js'

async function seatXi(fx, matchId, squadSize = 4) {
  const mpsA = []
  for (const p of fx.squadA.slice(0, squadSize)) mpsA.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of fx.squadB.slice(0, squadSize)) mpsB.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
  return { mpsA, mpsB }
}

/** An upcoming match: created, no roster/toss/start — Part 84/98 territory. */
async function makeUpcomingMatch(fx, { oversPerInnings = 20, daysFromNow = 3 } = {}) {
  const matchDate = new Date(Date.now() + daysFromNow * 86400000).toISOString()
  return matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'LOC Community Ground', matchDate, oversPerInnings, ballsPerOver: 6 })
}

/** A live match with innings 1 partially bowled (not complete) — Part 85 territory. */
async function makeLiveFirstInningsMatch(fx, { oversPerInnings = 5, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'LOC Community Ground', matchDate: new Date().toISOString(), oversPerInnings, ballsPerOver: 6 })
  const { mpsA, mpsB } = await seatXi(fx, match.id, squadSize)
  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)
  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  await bowl(innings1.id, mpsB[3], { batRuns: 4 })
  await bowl(innings1.id, mpsB[3], { batRuns: 1 })
  await bowl(innings1.id, mpsB[3], { batRuns: 2 })
  return { matchId: match.id, mpsA, mpsB, innings1 }
}

/** A live match sitting at innings break — innings 1 completed, innings 2 not yet created. Part 86. */
async function makeInningsBreakMatch(fx, { oversPerInnings = 2, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'LOC Community Ground', matchDate: new Date().toISOString(), oversPerInnings, ballsPerOver: 6 })
  const { mpsA, mpsB } = await seatXi(fx, match.id, squadSize)
  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)
  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  await bowlDots(innings1.id, [mpsB[3], mpsB[2]], oversPerInnings * 6)
  return { matchId: match.id, mpsA, mpsB }
}

/** A live match chasing in the second innings — Part 9/97 chase preview. */
async function makeLiveChaseMatch(fx, { oversPerInnings = 5, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'LOC Community Ground', matchDate: new Date().toISOString(), oversPerInnings, ballsPerOver: 6 })
  const { mpsA, mpsB } = await seatXi(fx, match.id, squadSize)
  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)
  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
  await bowlDots(innings1.id, [mpsB[3], mpsB[2]], oversPerInnings * 6 - 6)
  await bowl(innings1.id, mpsB[3], { batRuns: 6 })
  await bowl(innings1.id, mpsB[3], { batRuns: 6 })
  await bowl(innings1.id, mpsB[3], { batRuns: 6 })
  await bowl(innings1.id, mpsB[3], { batRuns: 6 })
  await bowl(innings1.id, mpsB[3], { batRuns: 6 })
  await bowl(innings1.id, mpsB[3], { batRuns: 6 }) // innings 1 complete, target set

  const innings2 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsB[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsB[1].id } } })
  await bowlDots(innings2.id, [mpsA[3], mpsA[2]], oversPerInnings * 6 - 6) // leaves exactly 1 over remaining, well short of target
  return { matchId: match.id, mpsA, mpsB }
}

test('P1/P92 — LIVE category includes an in-progress match, excludes upcoming/results', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const upcoming = await makeUpcomingMatch(fx)
    const live = await makeLiveFirstInningsMatch(fx)
    const { matchId: completedId } = await playShortFinalizedMatch(fx, { finalize: false })

    const result = await publicMatchService.listPublicMatches({ category: 'LIVE', limit: 50, offset: 0 })
    const ids = result.items.map((i) => i.id)
    assert.ok(ids.includes(live.matchId), 'the in-progress match must be in LIVE')
    assert.ok(!ids.includes(upcoming.id), 'an upcoming match must never appear in LIVE')
    assert.ok(!ids.includes(completedId), 'a completed match must never appear in LIVE')

    const liveCard = result.items.find((i) => i.id === live.matchId)
    assert.equal(liveCard.status, 'live')
    assert.equal(liveCard.isInningsBreak, false)
    assert.equal(liveCard.innings.length, 1)
    assert.equal(liveCard.innings[0].runs, 7) // 4 + 1 + 2 scripted above
  } finally {
    await fx.cleanup()
  }
})

test('P2/P86/P92 — LIVE category includes an innings-break match, labeled as such, never as Upcoming', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeInningsBreakMatch(fx)
    const result = await publicMatchService.listPublicMatches({ category: 'LIVE', limit: 50, offset: 0 })
    const card = result.items.find((i) => i.id === matchId)
    assert.ok(card, 'innings-break match must be discoverable under LIVE')
    assert.equal(card.status, 'live')
    assert.equal(card.isInningsBreak, true)
    assert.equal(card.innings.length, 1, 'only innings 1 exists yet')
  } finally {
    await fx.cleanup()
  }
})

test('P3/P93/P80 — UPCOMING category is sorted soonest-first and never includes live/results', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const later = await makeUpcomingMatch(fx, { daysFromNow: 10 })
    const sooner = await makeUpcomingMatch(fx, { daysFromNow: 1 })
    const live = await makeLiveFirstInningsMatch(fx)

    const result = await publicMatchService.listPublicMatches({ category: 'UPCOMING', limit: 50, offset: 0 })
    const ids = result.items.map((i) => i.id)
    assert.ok(!ids.includes(live.matchId))
    const soonerIdx = ids.indexOf(sooner.id)
    const laterIdx = ids.indexOf(later.id)
    assert.ok(soonerIdx !== -1 && laterIdx !== -1)
    assert.ok(soonerIdx < laterIdx, 'the nearer upcoming match must sort first')

    const soonerCard = result.items.find((i) => i.id === sooner.id)
    assert.deepEqual(soonerCard.innings, [], 'an upcoming match has no innings yet — Part 84/98')
    assert.equal(soonerCard.chase, null)
  } finally {
    await fx.cleanup()
  }
})

test('P4/P94/P6/P46/P88/P89 — RESULTS includes completed+finalized newest-first, and distinguishes them', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId: completedId } = await playShortFinalizedMatch(fx, { finalize: false })
    const { matchId: finalizedId } = await playShortFinalizedMatch(fx, { finalize: true })
    const live = await makeLiveFirstInningsMatch(fx)

    const result = await publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 50, offset: 0 })
    const ids = result.items.map((i) => i.id)
    assert.ok(ids.includes(completedId))
    assert.ok(ids.includes(finalizedId))
    assert.ok(!ids.includes(live.matchId), 'a live match must never appear in RESULTS')

    const completedCard = result.items.find((i) => i.id === completedId)
    const finalizedCard = result.items.find((i) => i.id === finalizedId)
    assert.equal(completedCard.awaitingFinalization, true)
    assert.equal(completedCard.isOfficial, false)
    assert.equal(finalizedCard.awaitingFinalization, false)
    assert.equal(finalizedCard.isOfficial, true)
    assert.ok(completedCard.result.text.length > 0)
    assert.deepEqual(completedCard.innings.map((i) => i.runs), finalizedCard.innings.map((i) => i.runs), 'finalization must never change the cricket totals')
  } finally {
    await fx.cleanup()
  }
})

test('P7/P9/P97 — live chase preview reuses the exact target/required-run-rate math, not reimplemented', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await makeLiveChaseMatch(fx, { oversPerInnings: 5 })
    const result = await publicMatchService.listPublicMatches({ category: 'LIVE', limit: 50, offset: 0 })
    const card = result.items.find((i) => i.id === matchId)
    assert.ok(card)
    assert.equal(card.innings.length, 2)
    assert.equal(card.innings[0].runs, 36) // 6 sixes
    assert.equal(card.chase.target, 37)
    assert.equal(card.chase.runsNeeded, 37)
    assert.equal(card.chase.ballsRemaining, 6) // 1 over left of a 5-over chase
    assert.equal(card.chase.requiredRunRate, 37) // 37 needed off 1 over = run rate 37
  } finally {
    await fx.cleanup()
  }
})

test('P10/P100 — pagination: limit/offset/total are stable and every match appears exactly once across two pages', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    for (let i = 0; i < 3; i++) {
      await playShortFinalizedMatch(fx, { finalize: true })
    }

    const page1 = await publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 2, offset: 0 })
    assert.equal(page1.items.length, 2)
    assert.equal(page1.pagination.limit, 2)
    assert.equal(page1.pagination.offset, 0)
    assert.ok(page1.pagination.total >= 3)

    const page2 = await publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 2, offset: 2 })
    const page1Ids = page1.items.map((i) => i.id)
    const page2Ids = page2.items.map((i) => i.id)
    assert.equal(new Set([...page1Ids, ...page2Ids]).size, page1Ids.length + page2Ids.length, 'no duplicate rows across adjacent pages')
    assert.equal(page1.pagination.total, page2.pagination.total, 'total must be stable across pages')
  } finally {
    await fx.cleanup()
  }
})

test('P11/P76/P77/P101 — invalid category rejected; limit/offset are clamped, never trusted verbatim', async () => {
  await assert.rejects(() => publicMatchService.listPublicMatches({ category: 'DROP TABLE matches;--', limit: 10, offset: 0 }), /Unknown category/)
  await assert.rejects(() => publicMatchService.listPublicMatches({ limit: 10, offset: 0 }), /category query parameter is required/)

  const result = await publicMatchService.listPublicMatches({ category: 'UPCOMING', limit: 100000, offset: -50 })
  assert.equal(result.pagination.limit, 50, 'limit must be clamped to MAX_LIST_LIMIT')
  assert.equal(result.pagination.offset, 0, 'a negative offset must be clamped to 0')
})

test('P12/P36/P102 — public discovery responses never leak email/user_id/password/canteen data', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await makeUpcomingMatch(fx)
    await makeLiveFirstInningsMatch(fx)
    await playShortFinalizedMatch(fx, { finalize: true })

    const [live, upcoming, results, home] = await Promise.all([
      publicMatchService.listPublicMatches({ category: 'LIVE', limit: 20, offset: 0 }),
      publicMatchService.listPublicMatches({ category: 'UPCOMING', limit: 20, offset: 0 }),
      publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 20, offset: 0 }),
      publicMatchService.getHomeDiscovery(),
    ])
    const blob = JSON.stringify({ live, upcoming, results, home })
    for (const forbidden of ['@example', 'user_id', 'password', 'canteen', 'refresh_token', 'otp']) {
      assert.ok(!blob.toLowerCase().includes(forbidden.toLowerCase()), `response must never contain '${forbidden}'`)
    }
  } finally {
    await fx.cleanup()
  }
})

test('P13/P32/P103/P104 — home discovery is bounded and never errors, featured slot fills once a live match exists', async () => {
  // Other integration test files run against this same shared dev database
  // and may have their own transient 'live' fixtures mid-flight, so this
  // deliberately never asserts featuredLiveMatch === null (that would be
  // asserting a fact about global DB state this test does not own) — Part
  // 104's real requirement is just "the endpoint never errors and stays
  // bounded regardless," which the two assertions below prove unconditionally.
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    for (let i = 0; i < 5; i++) await makeUpcomingMatch(fx, { daysFromNow: i + 1 })
    for (let i = 0; i < 5; i++) await playShortFinalizedMatch(fx, { finalize: true })

    const home = await publicMatchService.getHomeDiscovery()
    assert.ok(home.upcomingMatches.length <= 3, 'homepage upcoming preview must stay bounded regardless of how many upcoming matches exist')
    assert.ok(home.recentResults.length <= 3, 'homepage results preview must stay bounded regardless of how many results exist')
    assert.ok(home.featuredLiveMatch === null || typeof home.featuredLiveMatch === 'object', 'featured slot is null or one match, never an array/error')

    const live = await makeLiveFirstInningsMatch(fx)
    const home2 = await publicMatchService.getHomeDiscovery()
    assert.ok(home2.featuredLiveMatch, 'a live match now exists somewhere -> the featured slot is filled, not null')
    assert.equal(home2.featuredLiveMatch.status, 'live')
    assert.ok(home2.featuredLiveMatch.teamA?.name && home2.featuredLiveMatch.teamB?.name, 'featured match card has valid team shape')

    const liveList = await publicMatchService.listPublicMatches({ category: 'LIVE', limit: 50, offset: 0 })
    assert.ok(liveList.items.some((i) => i.id === live.matchId), 'the match we just created is discoverable under LIVE (identity proven here, not via the featured slot, since featured selection order is not this fixture\'s to own)')
  } finally {
    await fx.cleanup()
  }
})

test('P14/P89/P105 — finalization transition: awaiting-finalization -> official result, cricket score identical', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx, { finalize: false })

    const before = await publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 50, offset: 0 })
    const beforeCard = before.items.find((i) => i.id === matchId)
    assert.equal(beforeCard.awaitingFinalization, true)
    assert.equal(beforeCard.isOfficial, false)

    await matchService.finalizeMatch(matchId)

    const after = await publicMatchService.listPublicMatches({ category: 'RESULTS', limit: 50, offset: 0 })
    const afterCard = after.items.find((i) => i.id === matchId)
    assert.equal(afterCard.awaitingFinalization, false)
    assert.equal(afterCard.isOfficial, true)
    assert.deepEqual(afterCard.innings, beforeCard.innings, 'finalizing must never change the score')
    assert.deepEqual(afterCard.result, beforeCard.result)
  } finally {
    await fx.cleanup()
  }
})

test('P15/P44/P106 — every public match id resolves through the existing Phase 9 summary read model', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const upcoming = await makeUpcomingMatch(fx)
    const live = await makeLiveFirstInningsMatch(fx)
    const { matchId: finalizedId } = await playShortFinalizedMatch(fx, { finalize: true })

    for (const id of [upcoming.id, live.matchId, finalizedId]) {
      const summary = await matchSummaryService.getMatchSummary(id)
      assert.equal(summary.match.id, id)
      assert.equal(summary.teams.teamA.name, 'Integration Test Match A')
    }
  } finally {
    await fx.cleanup()
  }
})

test('P8/P98/P84 — upcoming match card handles zero innings and zero roster with no crash', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const upcoming = await makeUpcomingMatch(fx)
    const result = await publicMatchService.listPublicMatches({ category: 'UPCOMING', limit: 50, offset: 0 })
    const card = result.items.find((i) => i.id === upcoming.id)
    assert.ok(card)
    assert.deepEqual(card.innings, [])
    assert.equal(card.result, null)
    assert.equal(card.chase, null)
    assert.equal(card.isInningsBreak, false)
  } finally {
    await fx.cleanup()
  }
})
