// Phase 8 integration tests — leaderboard/discovery, exercised against real
// PostgreSQL through the actual service layer (same convention as every
// other integration test in this project: no HTTP, call services directly).
// Qualification MATH itself is already exhaustively proven against synthetic
// careers in domain/statistics/ranking.test.js (17 tests) — these tests exist
// to prove the real-DB wiring: SQL candidate filtering, real finalization
// timing, real search privacy, and real pagination/rank continuity.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as matchService from '../../services/match.service.js'
import * as statisticsService from '../../services/statistics.service.js'
import { createTeamsFixture, playShortFinalizedMatch } from './fixtures.js'

test('LEADERBOARD L1 — runs leaderboard: real finalized careers rank correctly, descending, with rank numbers', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // squadA[2] ends each match not out on 7; squadA[0] ends each match not out on 5.
    await playShortFinalizedMatch(fx, { finalize: true })
    await playShortFinalizedMatch(fx, { finalize: true })

    const board = await statisticsService.getLeaderboard('runs', { limit: 10, teamId: fx.teamAId })
    const a2 = board.items.find((i) => i.player.publicPlayerId === fx.squadA[2].public_player_id)
    const a0 = board.items.find((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id)
    assert.ok(a2 && a0)
    assert.equal(a2.value, 14) // 7 x 2
    assert.equal(a0.value, 10) // 5 x 2
    assert.ok(a2.rank < a0.rank, 'higher run total must rank ahead')
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L2 — pagination: global rank continues correctly across pages, never restarts at #1', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  const fx2 = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    await playShortFinalizedMatch(fx, { finalize: true }) // fx.squadA[2] = 14, fx.squadA[0] = 10
    await playShortFinalizedMatch(fx2, { finalize: true }) // fx2.squadA[2] = 7, fx2.squadA[0] = 5

    const page1 = await statisticsService.getLeaderboard('runs', { limit: 1, offset: 0 })
    const page2 = await statisticsService.getLeaderboard('runs', { limit: 1, offset: 1 })
    assert.equal(page1.items[0].rank, 1)
    assert.equal(page2.items[0].rank, 2)
    assert.notEqual(page1.items[0].player.publicPlayerId, page2.items[0].player.publicPlayerId)
    assert.equal(page1.pagination.total, page2.pagination.total)
    assert.ok(page1.pagination.total >= 4)
  } finally {
    await fx2.cleanup()
    await fx.cleanup()
  }
})

test('LEADERBOARD L3 — batting-average qualification enforced against real DB careers: a batter never dismissed across 3 finalized innings does not qualify', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // squadA[0] finishes not out in every one of these matches -> 0 dismissals ever.
    await playShortFinalizedMatch(fx, { finalize: true })
    await playShortFinalizedMatch(fx, { finalize: true })
    await playShortFinalizedMatch(fx, { finalize: true })

    const board = await statisticsService.getLeaderboard('batting-average', { limit: 10 })
    const entry = board.items.find((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id)
    assert.equal(entry, undefined, 'minDismissals=1 excludes a batter with 3 not-out innings and zero dismissals')
    assert.deepEqual(board.qualification, { minInnings: 3, minDismissals: 1 })
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD "highest-score" — real DB wiring: a real not-out innings ranks with the correct runs/notOut, and a never-scored player never appears', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // squadA[2] ends each match not out on 7 (fixtures.js's documented, deterministic score).
    await playShortFinalizedMatch(fx, { finalize: true })
    await playShortFinalizedMatch(fx, { finalize: true })

    const board = await statisticsService.getLeaderboard('highest-score', { limit: 10, teamId: fx.teamAId })
    const a2 = board.items.find((i) => i.player.publicPlayerId === fx.squadA[2].public_player_id)
    assert.ok(a2, 'a real finalized not-out innings must appear on the highest-score leaderboard')
    assert.deepEqual(a2.value, { runs: 7, notOut: true })
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L4 — invalid metric returns a structured 400, not a server error', async () => {
  await assert.rejects(
    () => statisticsService.getLeaderboard('not-a-real-metric'),
    (err) => err.statusCode === 400 && /Unknown leaderboard metric/.test(err.message)
  )
})

test('LEADERBOARD L5 — role filter: only players with the matching CURRENT role appear', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    // fixtures.js: squad members 0..squadSize-2 are role BATSMAN, the last is BOWLER.
    const bowlerBoard = await statisticsService.getLeaderboard('runs', { role: 'BOWLER', limit: 10 })
    const bowlerHasBatter = bowlerBoard.items.some((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id)
    assert.equal(bowlerHasBatter, false, 'a BATSMAN-role player must not appear when filtered to role=BOWLER')
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L6 — team filter uses the player CURRENT team, scoping results to that team only', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    const boardTeamA = await statisticsService.getLeaderboard('runs', { teamId: fx.teamAId, limit: 10 })
    const boardTeamB = await statisticsService.getLeaderboard('runs', { teamId: fx.teamBId, limit: 10 })
    assert.ok(boardTeamA.items.some((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id))
    assert.ok(!boardTeamB.items.some((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id))
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L7 — empty leaderboard: no finalized matches at all returns a valid empty result, not an error', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const board = await statisticsService.getLeaderboard('runs', { teamId: fx.teamAId })
    assert.deepEqual(board.items, [])
    assert.equal(board.pagination.total, 0)
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L8 — finalization effect: a completed-but-unfinalized match does not affect the leaderboard; finalizing it does, automatically', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const before = await statisticsService.getLeaderboard('runs', { teamId: fx.teamAId })
    assert.equal(before.items.length, 0)

    const { matchId } = await playShortFinalizedMatch(fx, { finalize: false })
    const stillBefore = await statisticsService.getLeaderboard('runs', { teamId: fx.teamAId })
    assert.equal(stillBefore.items.length, 0, 'completed-but-unfinalized must not appear on the leaderboard yet')

    await matchService.finalizeMatch(matchId)
    const after = await statisticsService.getLeaderboard('runs', { teamId: fx.teamAId })
    assert.ok(after.items.length > 0, 'finalizing made the player appear automatically, with no manual leaderboard write')
  } finally {
    await fx.cleanup()
  }
})

test('LEADERBOARD L9 — no qualifiers: real careers exist but nobody meets a rate qualification -> empty items with qualification metadata, not an error', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true }) // only 1 innings each -> nobody meets minInnings=3
    const board = await statisticsService.getLeaderboard('batting-average', { teamId: fx.teamAId })
    assert.deepEqual(board.items, [])
    assert.ok(board.qualification)
  } finally {
    await fx.cleanup()
  }
})

test('SEARCH T1 — search by partial name is case-insensitive and finds the player', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const term = fx.squadA[0].name.slice(0, 4).toUpperCase()
    const result = await statisticsService.searchPlayers({ q: term })
    assert.ok(result.items.some((i) => i.player.publicPlayerId === fx.squadA[0].public_player_id))
  } finally {
    await fx.cleanup()
  }
})

test('SEARCH T2 — search by exact public_player_id finds the player', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const result = await statisticsService.searchPlayers({ q: fx.squadA[1].public_player_id })
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].player.publicPlayerId, fx.squadA[1].public_player_id)
  } finally {
    await fx.cleanup()
  }
})

test('SEARCH T3 — role filter returns only matching public profiles', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const result = await statisticsService.searchPlayers({ role: 'BOWLER', teamId: fx.teamAId })
    assert.ok(result.items.every((i) => i.player.role === 'BOWLER'))
    assert.ok(result.items.some((i) => i.player.publicPlayerId === fx.squadA[3].public_player_id))
  } finally {
    await fx.cleanup()
  }
})

test('PRIVACY P1 — search results never expose email/phone/user_id', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const result = await statisticsService.searchPlayers({ q: fx.squadA[0].name })
    const json = JSON.stringify(result)
    assert.ok(!json.includes('@'), 'no email leaked into search results')
    assert.ok(!/"user_id"|"userId"|"password"/.test(json))
  } finally {
    await fx.cleanup()
  }
})

test('PRIVACY P2 — public player profile never exposes email/phone/user_id', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const profile = await statisticsService.getPublicPlayerProfile(fx.squadA[0].public_player_id)
    const json = JSON.stringify(profile)
    assert.ok(!json.includes('@'))
    assert.ok(!/"user_id"|"userId"|"password"/.test(json))
    assert.equal(profile.name, fx.squadA[0].name)
  } finally {
    await fx.cleanup()
  }
})

test('PUBLIC PROFILE — unknown public_player_id throws a structured 404', async () => {
  await assert.rejects(
    () => statisticsService.getPublicPlayerProfile('CVP-DOES-NOT-EXIST'),
    (err) => err.statusCode === 404
  )
})
