// Phase 6 integration tests — full match/innings lifecycle: automatic
// completion (overs/all-out/target-chased), roster-aware all-out, second
// innings + target, chase math, match result derivation (wickets/runs/tie),
// finalization locking, refresh/reconstruction, and cross-innings correction
// recompute. Exercises the real service layer against real PostgreSQL, same
// convention as match.integration.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { pool } from '../../config/db.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import { createTeamsFixture } from './fixtures.js'

async function setupLiveMatch(fx, { oversPerInnings = 2, ballsPerOver = 6, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({
    teamAId: fx.teamAId,
    teamBId: fx.teamBId,
    venue: 'Integration Test Ground',
    matchDate: new Date().toISOString(),
    oversPerInnings,
    ballsPerOver,
  })

  const mpsA = []
  for (const p of fx.squadA.slice(0, squadSize)) mpsA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of fx.squadB.slice(0, squadSize)) mpsB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))

  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  const started = await matchService.startMatch(match.id)

  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[0].id } } })
  await scoringService.recordEvent({ inningsId: innings1.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: mpsA[1].id } } })

  return { match: started, innings1, mpsA, mpsB }
}

async function startSecondInnings(match, innings1, mpsA, mpsB) {
  const innings2 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 2, battingTeamId: innings1.bowling_team_id, bowlingTeamId: innings1.batting_team_id })
  // The batting side for innings 2 is whichever squad matches its battingTeamId.
  const battingSquad = innings2.batting_team_id === match.team_a_id ? mpsA : mpsB
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: battingSquad[0].id } } })
  await scoringService.recordEvent({ inningsId: innings2.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: battingSquad[1].id } } })
  return innings2
}

async function bowl(inningsId, bowlerMp, input) {
  const before = await scoringService.getInningsState(inningsId)
  return scoringService.recordDelivery({ inningsId, expectedVersion: before.innings.version, clientActionId: randomUUID(), input: { ...input, bowlerMatchPlayerId: bowlerMp.id } })
}

/** Bowls `n` dot balls, alternating between two bowlers by over so the
 * "same bowler can't bowl two overs in a row" rule never trips. */
async function bowlDots(inningsId, bowlers, n) {
  let last
  for (let i = 0; i < n; i++) {
    const { state } = await scoringService.getInningsState(inningsId)
    const bowler = bowlers[state.overNumber % bowlers.length]
    last = await bowl(inningsId, bowler, { batRuns: 0 })
  }
  return last
}

test('TEST 38 — overs completed: wide/no-ball do not consume the legal-ball quota, innings auto-completes exactly at the limit', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { innings1, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 2, ballsPerOver: 6 })
    const bowlers = [mpsB[3], mpsB[2]]

    await bowl(innings1.id, bowlers[0], { illegal: { type: 'wide', runs: 1 } })
    await bowl(innings1.id, bowlers[0], { illegal: { type: 'no-ball', runs: 1 } })
    const last = await bowlDots(innings1.id, bowlers, 12) // exactly fills 2 overs of 6 legal balls

    assert.equal(last.state.legalBalls, 12)
    assert.equal(last.state.isOversComplete, true)
    assert.equal(last.completion, null, 'innings 1 completing does not decide the match')

    const reloaded = await scoringService.getInningsState(innings1.id)
    assert.equal(reloaded.innings.status, 'completed')

    await assert.rejects(
      () => bowl(innings1.id, bowlers[1], { batRuns: 1 }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )
  } finally {
    await fx.cleanup()
  }
})

test('TEST 39 — variable roster all-out: a 4-player batting side is all out at 3 wickets, not 10', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { innings1, mpsA, mpsB } = await setupLiveMatch(fx, { squadSize: 4 })
    const bowlers = [mpsB[3], mpsB[2]]

    const w1 = await bowl(innings1.id, bowlers[0], { wicket: { type: 'bowled' } })
    assert.equal(w1.state.isAllOut, false, '1 of 3 batsmen out is not all out yet')
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: w1.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[2].id } } })

    const w2 = await bowl(innings1.id, bowlers[1], { wicket: { type: 'bowled' } })
    assert.equal(w2.state.isAllOut, false, '2 of 3 down is not all out yet')
    await scoringService.recordEvent({ inningsId: innings1.id, expectedVersion: w2.version, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: mpsA[3].id } } })

    const w3 = await bowl(innings1.id, bowlers[0], { wicket: { type: 'bowled' } })
    assert.equal(w3.state.wickets, 3)
    assert.equal(w3.state.isAllOut, true, '3 of 4 down: no replacement batsman left, all out')

    const reloaded = await scoringService.getInningsState(innings1.id)
    assert.equal(reloaded.innings.status, 'completed')

    await assert.rejects(
      () => bowl(innings1.id, bowlers[1], { batRuns: 1 }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )
  } finally {
    await fx.cleanup()
  }
})

test('TEST 40 — start second innings: target derived from innings 1, batting/bowling teams reversed', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx)
    const bowlers = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlers, 6) // over 0, bowlers[0]
    const last = await bowl(innings1.id, bowlers[1], { batRuns: 4 }) // over 1 must use the other bowler
    const totalAfterFirstOverPlus1 = last.state.runs
    await bowlDots(innings1.id, bowlers, 5) // fill out over 1 (still bowlers[1], same over)

    const innings1Final = await scoringService.getInningsState(innings1.id)
    assert.equal(innings1Final.innings.status, 'completed')
    assert.equal(innings1Final.state.runs, totalAfterFirstOverPlus1)

    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    assert.equal(innings2.batting_team_id, innings1Final.innings.bowlingTeamId ?? fx.teamBId)
    assert.equal(innings2.bowling_team_id, fx.teamAId)

    const innings2State = await scoringService.getInningsState(innings2.id)
    assert.equal(innings2State.format.target, innings1Final.state.runs + 1)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 41 — chase success: target reached immediately completes the innings and decides the match by wickets', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { squadSize: 4 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 11)
    const last1 = await bowl(innings1.id, bowlersB[0], { batRuns: 1 }) // innings1 total = 1, target = 2
    assert.equal(last1.state.isOversComplete, true)

    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]

    // First ball of the chase: a boundary immediately clears target=2 without exhausting overs.
    const chaseResult = await bowl(innings2.id, bowlersA[0], { batRuns: 4 })
    assert.equal(chaseResult.state.isTargetChased, true)
    assert.equal(chaseResult.state.isOversComplete, false, 'far from overs complete — must not wait for the rest of the over')
    assert.ok(chaseResult.completion.match, 'innings 2 completing must decide the match in the same transaction')
    assert.equal(chaseResult.completion.result.resultType, 'WICKETS')
    assert.equal(chaseResult.completion.result.winnerTeamId, innings2.batting_team_id)
    assert.equal(chaseResult.completion.result.resultMargin, 3, '4-player side, 0 wickets down: 3 wickets in hand')

    const matchRow = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.equal(matchRow.status, 'completed')
    assert.equal(matchRow.winner_team_id, innings2.batting_team_id)
    assert.equal(matchRow.result_type, 'WICKETS')
    assert.equal(matchRow.result_margin, 3)

    await assert.rejects(
      () => bowl(innings2.id, bowlersA[1], { batRuns: 1 }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )
  } finally {
    await fx.cleanup()
  }
})

test('TEST 42 — runs win: chase falls short, first-batting team wins by the exact run margin', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 5)
    await bowl(innings1.id, bowlersB[0], { batRuns: 6 }) // innings1 total = 6, target = 7

    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 5)
    const last2 = await bowl(innings2.id, bowlersA[0], { batRuns: 2 }) // innings2 total = 2, overs complete, well short

    assert.equal(last2.state.isOversComplete, true)
    assert.ok(last2.completion.match)
    assert.equal(last2.completion.result.resultType, 'RUNS')
    assert.equal(last2.completion.result.winnerTeamId, fx.teamAId)
    assert.equal(last2.completion.result.resultMargin, 4)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 43 — tie: second innings finishes exactly level, never having reached target', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 5)
    await bowl(innings1.id, bowlersB[0], { batRuns: 6 }) // innings1 total = 6, target = 7

    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 5)
    const last2 = await bowl(innings2.id, bowlersA[0], { batRuns: 6 }) // innings2 total = 6 exactly — level, not chased

    assert.equal(last2.state.runs, 6)
    assert.equal(last2.state.isTargetChased, false)
    assert.equal(last2.state.isOversComplete, true)
    assert.equal(last2.completion.result.resultType, 'TIE')
    assert.equal(last2.completion.result.winnerTeamId, null)
    assert.equal(last2.completion.result.resultMargin, 0)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 44 — non-six-ball over: legal-ball/over math is correct throughout with ballsPerOver = 4', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { innings1, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 2, ballsPerOver: 4 })
    const bowlers = [mpsB[3], mpsB[2]]

    const afterOne = await bowl(innings1.id, bowlers[0], { batRuns: 1 })
    assert.equal(afterOne.state.overNumber, 0)
    assert.equal(afterOne.state.ballInOver, 1)

    const last = await bowlDots(innings1.id, bowlers, 7) // 1 + 7 = 8 legal balls = 2 overs of 4
    assert.equal(last.state.legalBalls, 8)
    assert.equal(last.state.overNumber, 2)
    assert.equal(last.state.ballInOver, 0)
    assert.equal(last.state.isOversComplete, true)
    assert.equal(last.state.ballsPerOver, 4)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 45 — no scoring after innings complete: rejected with no new row, before a second innings exists', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { innings1, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlers = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlers, 6)

    const { rows: before } = await pool.query('SELECT COUNT(*)::int AS c FROM deliveries WHERE innings_id = $1', [innings1.id])
    await assert.rejects(
      () => bowl(innings1.id, bowlers[0], { batRuns: 1 }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )
    const { rows: after } = await pool.query('SELECT COUNT(*)::int AS c FROM deliveries WHERE innings_id = $1', [innings1.id])
    assert.equal(after[0].c, before[0].c)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 46 — no scoring or corrections after the match is finalized', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 5)
    const lastD = await bowl(innings1.id, bowlersB[0], { batRuns: 6 })
    const targetDeliveryId = lastD.delivery.id

    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 5)
    await bowl(innings2.id, bowlersA[0], { batRuns: 6 }) // tie, match completed

    const finalized = await matchService.finalizeMatch(match.id)
    assert.equal(finalized.status, 'finalized')
    assert.ok(finalized.finalized_at)

    await assert.rejects(
      () => bowl(innings2.id, bowlersA[1], { batRuns: 1 }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )

    await assert.rejects(
      () =>
        correctionService.applyCorrection({
          inningsId: innings1.id,
          targetType: 'delivery',
          targetId: targetDeliveryId,
          patch: { batRuns: 4 },
          reasonCode: 'WRONG_RUNS',
          expectedVersion: innings1Final.innings.version,
          clientActionId: randomUUID(),
          correctedByUserId: fx.userId,
        }),
      (err) => err.code === 'MATCH_LOCKED'
    )
  } finally {
    await fx.cleanup()
  }
})

test('TEST 47 — refresh at innings break: lifecycle state reconstructs correctly with no second innings yet', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlers = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlers, 6)

    // "Refresh" = reload everything from scratch, no reliance on prior state.
    const reloadedInnings1 = await scoringService.getInningsState(innings1.id)
    assert.equal(reloadedInnings1.innings.status, 'completed')

    const matchRow = (await pool.query('SELECT status FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.equal(matchRow.status, 'live', 'match is not decided yet — this IS the innings-break state, derived, not stored')

    const allInnings = await scoringService.listInningsByMatch(match.id)
    assert.equal(allInnings.length, 1, 'no innings 2 yet')
  } finally {
    await fx.cleanup()
  }
})

test('TEST 48 — refresh during chase: target/score/players reconstruct identically', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 2 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 12)
    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowl(innings2.id, bowlersA[0], { batRuns: 3 })

    const live = await scoringService.getInningsState(innings2.id)
    const reloaded = await scoringService.getInningsState(innings2.id)

    assert.deepEqual(reloaded.format.target, live.format.target)
    assert.deepEqual(reloaded.state.runs, live.state.runs)
    assert.deepEqual(reloaded.state.ends, live.state.ends)
    assert.deepEqual(reloaded.state.batsmen, live.state.batsmen)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 49 — result reconstruction: completed match survives a from-scratch reload identically', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 5)
    await bowl(innings1.id, bowlersB[0], { batRuns: 6 })
    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 6) // all dots, innings2 = 0, overs complete

    const matchRow1 = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    const matchRow2 = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.deepEqual(matchRow1.result_type, matchRow2.result_type)
    assert.equal(matchRow1.result_type, 'RUNS')
    assert.equal(matchRow1.winner_team_id, fx.teamAId)
    assert.equal(matchRow1.result_margin, 6)
    assert.equal(matchRow1.status, 'completed')
  } finally {
    await fx.cleanup()
  }
})

test('TEST 50 — correction before finalization: correcting innings 1 after the match is decided recomputes the winner', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { match, innings1, mpsA, mpsB } = await setupLiveMatch(fx, { oversPerInnings: 1 })
    const bowlersB = [mpsB[3], mpsB[2]]
    await bowlDots(innings1.id, bowlersB, 5)
    const lastD = await bowl(innings1.id, bowlersB[0], { batRuns: 1 }) // innings1 = 1, target = 2
    const targetDeliveryId = lastD.delivery.id

    const innings1Final = await scoringService.getInningsState(innings1.id)
    const innings2 = await startSecondInnings(match, innings1Final.innings, mpsA, mpsB)
    const bowlersA = [mpsA[3], mpsA[2]]
    await bowlDots(innings2.id, bowlersA, 5)
    const last2 = await bowl(innings2.id, bowlersA[0], { batRuns: 2 }) // innings2 reaches 2 >= target(2): WICKETS win

    assert.equal(last2.completion.result.resultType, 'WICKETS')
    const matchAfterInnings2 = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.equal(matchAfterInnings2.status, 'completed')
    assert.equal(matchAfterInnings2.winner_team_id, innings2.batting_team_id)

    // Corrected: that 1 run in over 1 was actually a SIX — innings1 total becomes
    // 6, target becomes 7. Innings 2's actual final total (2) never got near 7.
    const correctionPreviewVersion = (await scoringService.getInningsState(innings1.id)).innings.version
    const applied = await correctionService.applyCorrection({
      inningsId: innings1.id,
      targetType: 'delivery',
      targetId: targetDeliveryId,
      patch: { batRuns: 6 },
      reasonCode: 'WRONG_RUNS',
      expectedVersion: correctionPreviewVersion,
      clientActionId: randomUUID(),
      correctedByUserId: fx.userId,
    })
    assert.ok(applied.correction)

    const matchAfterCorrection = (await pool.query('SELECT * FROM matches WHERE id = $1', [match.id])).rows[0]
    assert.equal(matchAfterCorrection.status, 'completed', 'still decided, just a different decision')
    assert.equal(matchAfterCorrection.result_type, 'RUNS', 'innings 2 (2 runs) never reached the corrected higher total (6)')
    assert.equal(matchAfterCorrection.winner_team_id, fx.teamAId, 'winner flips to the first-batting team')
    assert.equal(matchAfterCorrection.result_margin, 4)

    const innings1Reloaded = await scoringService.getInningsState(innings1.id)
    assert.equal(innings1Reloaded.state.runs, 6)
  } finally {
    await fx.cleanup()
  }
})
