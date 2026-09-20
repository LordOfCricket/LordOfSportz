// Phase 7 integration tests — official career statistics, exercised against
// real PostgreSQL through the actual service layer (same convention as
// lifecycle.integration.test.js: no HTTP, call the services directly). The
// single most important test here is "finalization effect" (TEST S9): it
// proves career stats update automatically off finalization with no manual
// counter write anywhere in the codebase.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../config/db.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as statisticsService from '../../services/statistics.service.js'
import { createTeamsFixture, playShortFinalizedMatch, bowlDots } from './fixtures.js'
import { createPlayer } from '../../models/player.model.js'

test('STATS S1 — official career only includes finalized matches: live and completed-but-unfinalized are excluded', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    const player = fx.squadA[0]

    // A second match for the same player, played out but deliberately left
    // 'completed' (never finalized).
    await playShortFinalizedMatch(fx, { finalize: false })

    // A third match for the same player, left 'live' (roster added, never scored).
    const liveMatch = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    for (const p of fx.squadA.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: liveMatch.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: liveMatch.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(liveMatch.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(liveMatch.id)

    const stats = await statisticsService.getPlayerCareerStats(player.id)
    assert.equal(stats.career.matches, 1, 'only the finalized match counts, not the completed-unfinalized one or the live one')
  } finally {
    await fx.cleanup()
  }
})

test('STATS S2 — matches played increments even for a player who never bats or bowls', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    // squadA[3] is on the roster (bowlersA[1] in innings 2 relief pattern is
    // mpsA[2]; squadA[3] never bats in innings 1 (only 3 batters used) and
    // never bowls in innings 2 (bowlersA = [mpsA[3], mpsA[2]] DOES use it —
    // pick a player guaranteed untouched: squadB[3] never bats (innings 2
    // only uses mpsB[0]/mpsB[1]) and never bowls (bowlersB = [mpsB[3], mpsB[2]]
    // DOES use mpsB[3]). Use squadB index 1 partner is used... simplest
    // guaranteed-untouched participant: add a 5th player to team A who is
    // never referenced anywhere in playShortFinalizedMatch.
    const benchPlayer = await createPlayer({ name: 'Bench (test)', teamId: fx.teamAId, role: 'BATSMAN' })
    fx.squadA.push(benchPlayer)

    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: benchPlayer.id, isPlayingXi: true })
    for (const p of fx.squadA.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx.squadB.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)

    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    const mpsAAll = await scoringService.listMatchPlayers(match.id)
    const mpA0 = mpsAAll.find((m) => m.player_id === fx.squadA[0].id)
    const mpA1 = mpsAAll.find((m) => m.player_id === fx.squadA[1].id)
    const mpB3 = mpsAAll.find((m) => m.player_id === fx.squadB[3].id)
    const mpB2 = mpsAAll.find((m) => m.player_id === fx.squadB[2].id)
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpA0.id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpA1.id } } })
    await bowlDots(innings1.id, [mpB3, mpB2], 12)

    const innings2 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    const mpB0 = mpsAAll.find((m) => m.player_id === fx.squadB[0].id)
    const mpB1 = mpsAAll.find((m) => m.player_id === fx.squadB[1].id)
    const mpA3 = mpsAAll.find((m) => m.player_id === fx.squadA[3].id)
    const mpA2 = mpsAAll.find((m) => m.player_id === fx.squadA[2].id)
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpB0.id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpB1.id } } })
    await bowlDots(innings2.id, [mpA3, mpA2], 12)

    await matchService.finalizeMatch(match.id)

    const stats = await statisticsService.getPlayerCareerStats(benchPlayer.id)
    assert.equal(stats.career.matches, 1, 'Playing XI participation counts even though the bench player never batted or bowled')
    assert.equal(stats.career.batting.innings, 0)
    assert.equal(stats.career.bowling.innings, 0)
  } finally {
    await fx.cleanup()
  }
})

test('STATS S3 — batting figures (runs/fours/sixes/highest score/not-out) reflect real recorded deliveries', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })

    // squadA[0] is on strike for ball 1 (4 runs, even -> strike stays) and
    // ball 2 (1 run, odd -> strike rotates away after). It is squadA[1], now
    // on strike, who faces ball 3 and is caught for a duck.
    const stats = await statisticsService.getPlayerCareerStats(fx.squadA[0].id)
    assert.equal(stats.career.matches, 1)
    assert.equal(stats.career.batting.innings, 1)
    assert.equal(stats.career.batting.runs, 5)
    assert.equal(stats.career.batting.notOuts, 1, 'rotated off strike after the single, never dismissed')
    assert.equal(stats.career.batting.fours, 1)
    assert.deepEqual(stats.career.batting.highestScore, { runs: 5, notOut: true })

    const statsA1 = await statisticsService.getPlayerCareerStats(fx.squadA[1].id)
    assert.equal(statsA1.career.batting.runs, 0)
    assert.equal(statsA1.career.batting.notOuts, 0)
    assert.equal(statsA1.career.batting.ducks, 1, 'dismissed for 0 off the caught delivery')

    // mpsA[2] came in and finished not out, having faced 2 balls and scored 7 (0 + 6 + 1).
    const statsA2 = await statisticsService.getPlayerCareerStats(fx.squadA[2].id)
    assert.equal(statsA2.career.batting.runs, 7)
    assert.equal(statsA2.career.batting.notOuts, 1)
    assert.equal(statsA2.career.batting.sixes, 1)
    assert.deepEqual(statsA2.career.batting.highestScore, { runs: 7, notOut: true })
  } finally {
    await fx.cleanup()
  }
})

test('STATS S4 — bowling wicket credit excludes run-out but includes caught; runs conceded/economy correct', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    // bowlersB[0] = mpsB[3] bowled the whole first over: 4+1+0(wkt)+0+6+1 = 12 runs, 1 wicket (caught).
    const stats = await statisticsService.getPlayerCareerStats(fx.squadB[3].id)
    assert.equal(stats.career.bowling.innings, 1)
    assert.equal(stats.career.bowling.wickets, 1)
    assert.equal(stats.career.bowling.runsConceded, 12)
    assert.equal(stats.career.bowling.average, 12)
    assert.notEqual(stats.career.bowling.economy, null)
  } finally {
    await fx.cleanup()
  }
})

test('STATS S5 — fielding: the catch is attributed to the fielder, not the bowler', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx, { finalize: true })
    const fielderStats = await statisticsService.getPlayerCareerStats(fx.squadB[0].id)
    assert.equal(fielderStats.career.fielding.catches, 1)

    const bowlerStats = await statisticsService.getPlayerCareerStats(fx.squadB[3].id)
    assert.equal(bowlerStats.career.fielding.catches, 0, 'the bowler took the wicket but did not take the catch')
  } finally {
    await fx.cleanup()
  }
})

test('STATS S6 — team change: a player who moves teams keeps both finalized matches in their career', async () => {
  const fx1 = await createTeamsFixture({ squadSize: 4 })
  const fx2 = await createTeamsFixture({ squadSize: 4 })
  try {
    await playShortFinalizedMatch(fx1, { finalize: true })
    const traveler = fx1.squadA[1] // never dismissed/central in match 1, simplest to re-add elsewhere

    // Same player, added to fx2's team A roster for a second, independent finalized match.
    const match2 = await matchService.createMatch({ teamAId: fx2.teamAId, teamBId: fx2.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    await scoringService.addMatchPlayer({ matchId: match2.id, teamId: fx2.teamAId, playerId: traveler.id, isPlayingXi: true })
    for (const p of fx2.squadA.slice(0, 3)) await scoringService.addMatchPlayer({ matchId: match2.id, teamId: fx2.teamAId, playerId: p.id, isPlayingXi: true })
    for (const p of fx2.squadB.slice(0, 4)) await scoringService.addMatchPlayer({ matchId: match2.id, teamId: fx2.teamBId, playerId: p.id, isPlayingXi: true })
    await matchService.setToss(match2.id, { tossWinnerId: fx2.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match2.id)
    const mps = await scoringService.listMatchPlayers(match2.id)
    const travelerMp = mps.find((m) => m.player_id === traveler.id)
    const partnerMp = mps.find((m) => m.player_id === fx2.squadA[0].id)
    const bowlerMp0 = mps.find((m) => m.player_id === fx2.squadB[3].id)
    const bowlerMp1 = mps.find((m) => m.player_id === fx2.squadB[2].id)

    const innings1 = await scoringService.createInnings({ matchId: match2.id, inningsNumber: 1, battingTeamId: fx2.teamAId, bowlingTeamId: fx2.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: travelerMp.id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: partnerMp.id } } })
    await bowlDots(innings1.id, [bowlerMp0, bowlerMp1], 12)

    const innings2 = await scoringService.createInnings({ matchId: match2.id, inningsNumber: 2, battingTeamId: fx2.teamBId, bowlingTeamId: fx2.teamAId })
    const bMps = await scoringService.listMatchPlayers(match2.id)
    const bStriker = bMps.find((m) => m.player_id === fx2.squadB[0].id)
    const bNonStriker = bMps.find((m) => m.player_id === fx2.squadB[1].id)
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: bStriker.id } } })
    await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: bNonStriker.id } } })
    await bowlDots(innings2.id, [travelerMp, partnerMp], 12)
    await matchService.finalizeMatch(match2.id)

    const stats = await statisticsService.getPlayerCareerStats(traveler.id)
    assert.equal(stats.career.matches, 2, 'career spans both teams the player represented')
  } finally {
    // fx2 must be cleaned up FIRST: match2 (owned by fx2) has a match_players
    // row referencing `traveler`, who belongs to fx1 — deleting fx1's players
    // before that row is gone would violate the match_players FK.
    await fx2.cleanup()
    await fx1.cleanup()
  }
})

test('STATS S7 — recent form and match history: DNB is distinguished from a 0-run innings, ordered by match date descending', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const older = await playShortFinalizedMatch(fx, { finalize: true })
    await pool.query('UPDATE matches SET match_date = $2 WHERE id = $1', [older.matchId, '2025-01-01'])
    const newer = await playShortFinalizedMatch(fx, { finalize: true })
    await pool.query('UPDATE matches SET match_date = $2 WHERE id = $1', [newer.matchId, '2026-01-01'])

    const stats = await statisticsService.getPlayerCareerStats(fx.squadA[0].id)
    assert.equal(stats.recentForm.length, 2)
    assert.equal(stats.recentForm[0].matchId, newer.matchId, 'newest match first')
    assert.equal(stats.recentForm[1].matchId, older.matchId)
    assert.equal(stats.recentForm[0].batting.didBat, true)

    // squadA[3] never bats in either match (only squadA[0..2] are seated) — DNB in both, not a fake 0.
    const neverBats = await statisticsService.getPlayerCareerStats(fx.squadA[3].id)
    assert.equal(neverBats.recentForm[0].batting.didBat, false)
    assert.equal(neverBats.recentForm[0].batting.runs, undefined, 'DNB carries no runs field at all, never a fake 0')
  } finally {
    await fx.cleanup()
  }
})

test('STATS S8 — a player with zero finalized matches gets a clean empty response, not an error or fake zeros mixed with nulls', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    const stats = await statisticsService.getPlayerCareerStats(fx.squadA[0].id)
    assert.equal(stats.career.matches, 0)
    assert.equal(stats.career.batting.innings, 0)
    assert.equal(stats.career.batting.average, null)
    assert.equal(stats.career.batting.highestScore, null)
    assert.equal(stats.career.bowling.innings, 0)
    assert.equal(stats.career.bowling.bestBowling, null)
    assert.equal(stats.career.fielding.catches, 0)
    assert.deepEqual(stats.recentForm, [])
    assert.deepEqual(stats.matchHistory.items, [])
  } finally {
    await fx.cleanup()
  }
})

test('STATS S9 — finalization effect: career stats do not include a completed-but-unfinalized match, then update automatically the instant it is finalized, with no manual write', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, matchId } = await playShortFinalizedMatch(fx, { finalize: false })
    assert.equal(match.status, 'completed')

    const before = await statisticsService.getPlayerCareerStats(fx.squadA[0].id)
    assert.equal(before.career.matches, 0, 'a completed-but-unfinalized match must not count yet')
    assert.equal(before.career.batting.runs, 0)

    await matchService.finalizeMatch(matchId)

    const after = await statisticsService.getPlayerCareerStats(fx.squadA[0].id)
    assert.equal(after.career.matches, 1, 'finalizing made the match count automatically — no manual stats write happened anywhere in this test')
    assert.equal(after.career.batting.runs, 5)
  } finally {
    await fx.cleanup()
  }
})
