// Phase 9 integration tests — match summary/scorecard, exercised against real
// PostgreSQL through the actual service layer (same convention as every other
// integration test file: no HTTP, call the service directly — the route
// itself is exercised in the manual E2E pass).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import * as matchSummaryService from '../../services/matchSummary.service.js'
import { createTeamsFixture, playShortFinalizedMatch, bowl, bowlDots } from './fixtures.js'
import { updatePlayer } from '../../models/player.model.js'

test('MATCH SUMMARY M1 — basic summary: teams, result, both innings, toss, official status', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)

    assert.equal(summary.teams.teamA.id, fx.teamAId)
    assert.equal(summary.teams.teamB.id, fx.teamBId)
    assert.equal(summary.match.isOfficial, true)
    assert.equal(summary.match.awaitingFinalization, false)
    assert.equal(summary.toss.winnerTeamId, fx.teamAId)
    assert.match(summary.toss.text, /elected to bat/)
    assert.equal(summary.result.resultType, 'RUNS')
    assert.match(summary.result.text, /Won by/)
    assert.equal(summary.innings.length, 2)
    assert.equal(summary.innings[0].inningsNumber, 1)
    assert.equal(summary.innings[1].inningsNumber, 2)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M2 — batting figures and dismissal text match the known deterministic sequence', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const innings1 = summary.innings[0]

    // squadA[0] opens, hits the four and the single (5 runs), then the odd
    // single rotates strike onto squadA[1] before the caught dismissal —
    // squadA[0] itself is never dismissed.
    const notOutOpener = innings1.batting.find((r) => r.player.publicPlayerId === fx.squadA[0].public_player_id)
    assert.equal(notOutOpener.runs, 5)
    assert.equal(notOutOpener.status, 'NOT_OUT')

    const dismissed = innings1.batting.find((r) => r.player.publicPlayerId === fx.squadA[1].public_player_id)
    assert.equal(dismissed.status, 'OUT')
    assert.equal(dismissed.dismissalText, `c ${fx.squadB[0].name} b ${fx.squadB[3].name}`)

    const finisher = innings1.batting.find((r) => r.player.publicPlayerId === fx.squadA[2].public_player_id)
    assert.equal(finisher.status, 'NOT_OUT')
    assert.equal(finisher.dismissalText, 'not out')
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M3 — Playing XI member who never batted is DNB', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const row = summary.innings[0].batting.find((r) => r.player.publicPlayerId === fx.squadA[3].public_player_id)
    assert.equal(row.status, 'DNB')
    assert.equal(row.runs, null)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M4 — bowling figures: overs/maidens/runs/wickets/economy for the known deterministic sequence', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const bowlerRow = summary.innings[0].bowling.find((r) => r.player.publicPlayerId === fx.squadB[3].public_player_id)
    assert.equal(bowlerRow.wickets, 1)
    assert.ok(bowlerRow.runs > 0)
    assert.equal(bowlerRow.oversLabel.includes('.'), true)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M5 — fall of wickets is chronological and resolves the dismissed player', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const fow = summary.innings[0].fallOfWickets
    assert.equal(fow.length, 1)
    assert.equal(fow[0].wicketNumber, 1)
    assert.equal(fow[0].player.publicPlayerId, fx.squadA[1].public_player_id)
    assert.match(fow[0].overBall, /^\d+\.\d+$/)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M6 — partnerships: one closed by the wicket, one trailing unbeaten', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const partnerships = summary.innings[0].partnerships
    assert.equal(partnerships.length, 2)
    assert.equal(partnerships[0].endWicketNumber, 1)
    assert.equal(partnerships[1].unbeaten, true)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M7 — extras never double-count and illegal balls do not consume legal slots', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 1, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

    await bowl(innings1.id, mpsB[0], { illegal: { type: 'wide', runs: 1 } })
    await bowl(innings1.id, mpsB[0], { illegal: { type: 'no-ball', runs: 1 }, batRuns: 4 })
    await bowl(innings1.id, mpsB[0], { extra: { type: 'bye', runs: 2 } })
    await bowl(innings1.id, mpsB[0], { extra: { type: 'leg-bye', runs: 1 } })
    // The wide/no-ball above added 0 legal balls; the bye/leg-bye added 2 —
    // 4 more legal dots exactly completes the 1-over (6-legal-ball) innings.
    await bowlDots(innings1.id, [mpsB[0]], 4)

    const summary = await matchSummaryService.getMatchSummary(match.id)
    const innings = summary.innings[0]
    assert.deepEqual(innings.extras, { wides: 1, noBalls: 1, byes: 2, legByes: 1, total: 5 })
    assert.equal(innings.score.legalBalls, 6, 'the wide and no-ball must not have consumed legal-ball slots')
    assert.equal(innings.total.runs, 4 + 1 + 1 + 2 + 1) // 4 off the no-ball bat, +1 wide, +1 no-ball penalty, +2 byes, +1 leg-bye
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M8 — a 5-ball-per-over match formats overs correctly, never a hardcoded 6', async () => {
  // playShortFinalizedMatch's scripted over-1 sequence assumes exactly 6
  // balls per over, so a 5-ball-per-over match is built manually here
  // instead (same manual-construction pattern as M7/M9).
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 5 })
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    // 2 overs of 5 balls = 10 legal balls, alternating bowlers each over.
    await bowlDots(innings1.id, [mpsB[0], mpsB[1]], 10)

    const summary = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(summary.match.ballsPerOver, 5)
    const inningsSummary = summary.innings[0]
    assert.equal(inningsSummary.score.legalBalls, 10)
    assert.equal(inningsSummary.score.oversLabel, '2.0')
    assert.equal(inningsSummary.overs.length, 2)
    assert.equal(inningsSummary.overs[0].deliveries.length, 5)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M9 — correction safety: a historical correction is reflected automatically, nothing stale', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 1, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    const { delivery } = await bowl(innings1.id, mpsB[0], { batRuns: 1 })
    await bowlDots(innings1.id, [mpsB[0]], 5)

    const before = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(before.innings[0].total.runs, 1)

    const { innings: innings1Row } = await scoringService.getInningsState(innings1.id)
    await correctionService.applyCorrection({
      inningsId: innings1.id,
      targetType: 'delivery',
      targetId: delivery.id,
      patch: { batRuns: 6 },
      reasonCode: 'WRONG_RUNS',
      note: 'test correction',
      expectedVersion: innings1Row.version,
      correctedByUserId: fx.userId,
    })

    const after = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(after.innings[0].total.runs, 6)
    assert.notEqual(before.innings[0].total.runs, after.innings[0].total.runs)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M10 — completed vs finalized: totals never change on finalization, only lifecycle metadata', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx, { finalize: false })
    const beforeFinalize = await matchSummaryService.getMatchSummary(matchId)
    assert.equal(beforeFinalize.match.awaitingFinalization, true)
    assert.equal(beforeFinalize.match.isOfficial, false)

    await matchService.finalizeMatch(matchId)
    const afterFinalize = await matchSummaryService.getMatchSummary(matchId)
    assert.equal(afterFinalize.match.isOfficial, true)
    assert.equal(afterFinalize.match.awaitingFinalization, false)
    assert.deepEqual(
      beforeFinalize.innings.map((i) => i.total),
      afterFinalize.innings.map((i) => i.total)
    )
    assert.deepEqual(beforeFinalize.result, afterFinalize.result)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M11 — live summary exposes current batters/bowler/partnership, innings break is detected', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    const mpsA = []
    for (const p of fx.squadA) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
    const mpsB = []
    for (const p of fx.squadB) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    await matchService.startMatch(match.id)
    const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
    await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })
    await bowl(innings1.id, mpsB[0], { batRuns: 2 })

    const liveSummary = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(liveSummary.innings[0].status, 'live')
    assert.ok(liveSummary.innings[0].current)
    assert.equal(liveSummary.innings[0].current.partnership.runs, 2)
    assert.equal(liveSummary.match.isInningsBreak, false)

    // Finish innings 1 to trigger the innings-break window.
    await bowlDots(innings1.id, [mpsB[0], mpsB[1]], 11)
    const breakSummary = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(breakSummary.match.status, 'live')
    assert.equal(breakSummary.match.isInningsBreak, true)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M12 — upcoming match loads gracefully with zero innings, no fake 0/0 scorecard', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 2, ballsPerOver: 6 })
    const summary = await matchSummaryService.getMatchSummary(match.id)
    assert.equal(summary.match.status, 'upcoming')
    assert.deepEqual(summary.innings, [])
    assert.equal(summary.result, null)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M13 — privacy: no email/user_id/password ever appears in the public summary', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    const json = JSON.stringify(summary)
    assert.equal(/@/.test(json), false)
    assert.equal(/user_id/i.test(json), false)
    assert.equal(/password/i.test(json), false)
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M14 — every player reference resolves to a stable publicPlayerId, never a bare internal id', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const summary = await matchSummaryService.getMatchSummary(matchId)
    for (const row of summary.innings[0].batting) {
      assert.ok(row.player.publicPlayerId, `batting row for ${row.player.name} is missing a publicPlayerId`)
    }
    for (const entry of summary.playingXi.teamA) {
      assert.ok(entry.player.publicPlayerId)
    }
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M15 — a later change to a player\'s CURRENT team never rewrites their historical scorecard team', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId } = await playShortFinalizedMatch(fx)
    const before = await matchSummaryService.getMatchSummary(matchId)
    const beforeTeamAPlayers = before.playingXi.teamA.map((e) => e.player.publicPlayerId).sort()

    // Move squadA[0] to team B's roster (simulating a future transfer).
    await updatePlayer(fx.squadA[0].id, { team_id: fx.teamBId })

    const after = await matchSummaryService.getMatchSummary(matchId)
    const afterTeamAPlayers = after.playingXi.teamA.map((e) => e.player.publicPlayerId).sort()
    assert.deepEqual(afterTeamAPlayers, beforeTeamAPlayers, 'the historical Playing XI must come from match_players, never the player\'s current team')
  } finally {
    await fx.cleanup()
  }
})

test('MATCH SUMMARY M16 — 404 for a match that does not exist', async () => {
  await assert.rejects(() => matchSummaryService.getMatchSummary(999999999), (err) => err.statusCode === 404)
})
