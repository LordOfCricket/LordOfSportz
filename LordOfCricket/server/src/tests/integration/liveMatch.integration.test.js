// Phase 10 Part 3 — spectator live-state read model, proved against real
// PostgreSQL through the actual service layer (same service-level pattern as
// every prior phase's integration tests).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import * as liveMatchService from '../../services/liveMatch.service.js'
import { createTeamsFixture } from './fixtures.js'

async function seatXi(fx, matchId, squadSize = 4) {
  const mpsA = []
  for (const p of fx.squadA.slice(0, squadSize)) mpsA.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  const mpsB = []
  for (const p of fx.squadB.slice(0, squadSize)) mpsB.push(await scoringService.addMatchPlayer({ matchId, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
  return { mpsA, mpsB }
}

async function bowl(inningsId, bowlerMpId, input) {
  const { innings } = await scoringService.getInningsState(inningsId)
  return scoringService.recordDelivery({ inningsId, expectedVersion: innings.version, clientActionId: randomUUID(), input: { ...input, bowlerMatchPlayerId: bowlerMpId } })
}
async function seatBatsman(inningsId, end, mpId) {
  const { innings } = await scoringService.getInningsState(inningsId)
  return scoringService.recordEvent({ inningsId, expectedVersion: innings.version, event: { eventType: 'batsman-in', payload: { end, matchPlayerId: mpId } } })
}
async function currentBowlerId(inningsId, bowlerMps) {
  const { state } = await scoringService.getInningsState(inningsId)
  const overIndex = Math.floor(state.legalBalls / (state.ballsPerOver || 6))
  return (overIndex % 2 === 0 ? bowlerMps[3] : bowlerMps[2]).id
}

async function makeLiveMatch(fx, { oversPerInnings = 4, squadSize = 4 } = {}) {
  const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'Integration Test Ground', matchDate: new Date().toISOString(), oversPerInnings, ballsPerOver: 6 })
  const { mpsA, mpsB } = await seatXi(fx, match.id, squadSize)
  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  await matchService.startMatch(match.id)
  const innings1 = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId: fx.teamAId, bowlingTeamId: fx.teamBId })
  await seatBatsman(innings1.id, 'strikerEnd', mpsA[0].id)
  await seatBatsman(innings1.id, 'nonStrikerEnd', mpsA[1].id)
  return { matchId: match.id, innings1Id: innings1.id, mpsA, mpsB }
}

test('L1 — live mid-over: score/wickets/overs/striker/non-striker/bowler/current-over all reflect authoritative state', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { batRuns: 4 })
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { batRuns: 1 })

    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.match.status, 'live')
    assert.equal(live.match.isLive, true)
    assert.equal(live.currentInnings.runs, 5)
    assert.equal(live.currentInnings.wickets, 0)
    assert.equal(live.currentInnings.legalBalls, 2)
    assert.equal(live.currentInnings.oversLabel, '0.2')
    // 4 then 1 -> strike swapped once, so the original non-striker (squadA[1]) is now on strike
    assert.equal(live.currentInnings.striker.player.publicPlayerId, fx.squadA[1].public_player_id)
    assert.equal(live.currentInnings.currentOver.length, 2)
    assert.equal(live.currentInnings.currentOver[0].totalRuns, 4)
    assert.equal(live.currentInnings.bowler.wickets, 0)
  } finally {
    await fx.cleanup()
  }
})

test('L2/L106 — a new delivery recorded through the real scoring API is immediately reflected on the next fetch', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    const before = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(before.currentInnings.runs, 0)

    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { batRuns: 6 })

    const after = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(after.currentInnings.runs, 6)
    assert.notEqual(after.currentInnings.version, before.currentInnings.version)
  } finally {
    await fx.cleanup()
  }
})

test('L3/L107 — wide: score increases, legalBalls does not, illegal fact visible on the current-over chip', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { illegal: { type: 'wide', runs: 1 } })
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.currentInnings.runs, 1)
    assert.equal(live.currentInnings.legalBalls, 0)
    assert.deepEqual(live.currentInnings.currentOver[0].illegal, { type: 'wide', runs: 1 })
    assert.equal(live.currentInnings.currentOver[0].isLegalDelivery, false)
  } finally {
    await fx.cleanup()
  }
})

test('L4/L108 — no-ball: legal balls unaffected, free-hit reflected on the following delivery', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    await bowl(innings1Id, bowlerId, { illegal: { type: 'no-ball', runs: 1 }, batRuns: 2 })
    await bowl(innings1Id, bowlerId, { batRuns: 0 })
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.currentInnings.legalBalls, 1, 'the no-ball itself never counts as a legal ball')
    assert.equal(live.currentInnings.currentOver[0].illegal?.type, 'no-ball')
    assert.equal(live.currentInnings.currentOver[1].isFreeHit, true, 'the ball immediately after a no-ball is a free hit')
  } finally {
    await fx.cleanup()
  }
})

test('L5/L36/L109 — wicket: wicket count increments, current-over shows it, striker becomes null (waiting for next batsman)', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { wicket: { type: 'bowled' } })
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.currentInnings.wickets, 1)
    assert.equal(live.currentInnings.currentOver[0].wicket, true)
    assert.equal(live.currentInnings.striker, null, 'never fabricate a striker before the scorer seats one')
  } finally {
    await fx.cleanup()
  }
})

test('L6/L37/L110 — after seating a new batsman, the batsmen panel updates on the next fetch', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsA, mpsB } = await makeLiveMatch(fx)
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { wicket: { type: 'bowled' } })
    await seatBatsman(innings1Id, 'strikerEnd', mpsA[2].id)
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.currentInnings.striker.player.publicPlayerId, fx.squadA[2].public_player_id)
  } finally {
    await fx.cleanup()
  }
})

test('L7/L111 — over complete: overs/legalBalls/bowler figures correct after a full over', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    for (let i = 0; i < 6; i++) await bowl(innings1Id, bowlerId, { batRuns: 0 })
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.currentInnings.legalBalls, 6)
    assert.equal(live.currentInnings.oversLabel, '1.0')
    assert.equal(live.currentInnings.bowler.oversLabel, '1.0')
    assert.equal(live.currentInnings.currentOver.length, 6)
  } finally {
    await fx.cleanup()
  }
})

test('L8/L21/L112 — innings break: match stays live, currentInnings is the FINISHED first innings, target derived, no fake 0/0 second innings', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx, { oversPerInnings: 1 })
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    for (let i = 0; i < 6; i++) await bowl(innings1Id, bowlerId, { batRuns: i === 0 ? 4 : 0 })

    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.match.status, 'live')
    assert.equal(live.match.isInningsBreak, true)
    assert.equal(live.match.isLive, false, 'not actively "live batting" while at innings break')
    assert.equal(live.currentInnings.status, 'completed')
    assert.equal(live.currentInnings.runs, 4, 'shows the finished first-innings score')
    assert.equal(live.target, 5)
    assert.equal(live.currentInnings.striker, null)
    assert.equal(live.currentInnings.bowler, null)
  } finally {
    await fx.cleanup()
  }
})

test('L9/L22/L113/L114 — second innings started: transitions automatically, chase populated correctly', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsA, mpsB } = await makeLiveMatch(fx, { oversPerInnings: 1 })
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    for (let i = 0; i < 6; i++) await bowl(innings1Id, bowlerId, { batRuns: i === 0 ? 4 : 0 })

    const innings2 = await scoringService.createInnings({ matchId, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    await seatBatsman(innings2.id, 'strikerEnd', mpsB[0].id)
    await seatBatsman(innings2.id, 'nonStrikerEnd', mpsB[1].id)
    await bowl(innings2.id, await currentBowlerId(innings2.id, mpsA), { batRuns: 1 })

    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.match.isInningsBreak, false)
    assert.equal(live.match.isLive, true)
    assert.equal(live.currentInnings.number, 2)
    assert.equal(live.target, 5)
    assert.equal(live.currentInnings.chase.runsNeeded, 4)
    assert.equal(live.currentInnings.chase.ballsRemaining, 5)
    assert.ok(live.currentInnings.chase.requiredRunRate > 0)
  } finally {
    await fx.cleanup()
  }
})

test('L10/L17/L93/L115 — match completion: flags/result correct, no active-live batsman/bowler', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsA, mpsB } = await makeLiveMatch(fx, { oversPerInnings: 1 })
    const bowler1 = await currentBowlerId(innings1Id, mpsB)
    for (let i = 0; i < 6; i++) await bowl(innings1Id, bowler1, { batRuns: i === 0 ? 4 : 0 })
    const innings2 = await scoringService.createInnings({ matchId, inningsNumber: 2, battingTeamId: fx.teamBId, bowlingTeamId: fx.teamAId })
    await seatBatsman(innings2.id, 'strikerEnd', mpsB[0].id)
    await seatBatsman(innings2.id, 'nonStrikerEnd', mpsB[1].id)
    for (let i = 0; i < 6; i++) await bowl(innings2.id, await currentBowlerId(innings2.id, mpsA), { batRuns: 0 }) // team B never reaches target -> team A wins by runs

    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(live.match.status, 'completed')
    assert.equal(live.match.isCompleted, true)
    assert.equal(live.match.isLive, false)
    assert.ok(live.result)
    assert.equal(live.result.resultType, 'RUNS')
    assert.equal(live.currentInnings.striker, null)
    assert.equal(live.currentInnings.bowler, null)
  } finally {
    await fx.cleanup()
  }
})

test('L11/L116 — CRITICAL: a historical correction is fully reflected, never assumed to be "one more delivery"', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    const { delivery: firstDelivery } = await bowl(innings1Id, bowlerId, { batRuns: 2 })
    await bowl(innings1Id, bowlerId, { batRuns: 1 })
    await bowl(innings1Id, bowlerId, { batRuns: 0 })

    const beforeCorrection = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(beforeCorrection.currentInnings.runs, 3) // 2 + 1 + 0

    const { innings: inningsRow } = await scoringService.getInningsState(innings1Id)
    await correctionService.applyCorrection({
      inningsId: innings1Id,
      targetType: 'delivery',
      targetId: firstDelivery.id,
      patch: { batRuns: 1 }, // 2 -> 1
      reasonCode: 'WRONG_RUNS',
      note: 'Phase 10 Part 3 correction test',
      expectedVersion: inningsRow.version,
      correctedByUserId: fx.userId,
    })

    const after = await liveMatchService.getLiveMatchState(matchId)
    // Cross-check against a completely independent direct replay call — the
    // live-state DTO must match the authoritative server state exactly, not
    // "beforeCorrection.runs - 1" computed as a local delta.
    const { state: reReplayed } = await scoringService.getInningsState(innings1Id)
    assert.equal(after.currentInnings.runs, reReplayed.runs)
    assert.equal(after.currentInnings.runs, 2, '2+1+0 becomes 1+1+0 = 2')
    assert.notEqual(after.currentInnings.version, beforeCorrection.currentInnings.version)
  } finally {
    await fx.cleanup()
  }
})

test('L12/L118 — version is stable across an unchanged poll, and changes on both a delivery and a correction', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    const bowlerId = await currentBowlerId(innings1Id, mpsB)
    await bowl(innings1Id, bowlerId, { batRuns: 1 })

    const poll1 = await liveMatchService.getLiveMatchState(matchId)
    const poll2 = await liveMatchService.getLiveMatchState(matchId)
    assert.equal(poll1.currentInnings.version, poll2.currentInnings.version, 'no scoring activity between polls -> stable version')

    await bowl(innings1Id, bowlerId, { batRuns: 4 })
    const poll3 = await liveMatchService.getLiveMatchState(matchId)
    assert.notEqual(poll3.currentInnings.version, poll2.currentInnings.version)
  } finally {
    await fx.cleanup()
  }
})

test('L13/L62/L119 — live-state response never contains email/user_id/password/canteen data', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx)
    await bowl(innings1Id, await currentBowlerId(innings1Id, mpsB), { batRuns: 4 })
    const live = await liveMatchService.getLiveMatchState(matchId)
    const blob = JSON.stringify(live)
    for (const forbidden of ['@example', 'user_id', 'password', 'canteen', 'refresh_token', 'otp']) {
      assert.ok(!blob.toLowerCase().includes(forbidden.toLowerCase()), `response must never contain '${forbidden}'`)
    }
  } finally {
    await fx.cleanup()
  }
})

test('L14/L120 — bounded data: after many deliveries the response stays small (currentOver/recentDeliveries bounded)', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const { matchId, innings1Id, mpsB } = await makeLiveMatch(fx, { oversPerInnings: 20 })
    for (let i = 0; i < 40; i++) {
      const bowlerId = await currentBowlerId(innings1Id, mpsB)
      await bowl(innings1Id, bowlerId, { batRuns: i % 5 })
    }
    const live = await liveMatchService.getLiveMatchState(matchId)
    assert.ok(live.currentInnings.currentOver.length <= 6)
    assert.ok(live.currentInnings.recentDeliveries.length <= 12)
  } finally {
    await fx.cleanup()
  }
})

test('L15 — nonexistent match id -> structured 404, never a 500', async () => {
  await assert.rejects(() => liveMatchService.getLiveMatchState(999999999), (err) => err.statusCode === 404)
})

test('L16 — upcoming match with no innings: currentInnings/target are null, no crash', async () => {
  const fx = await createTeamsFixture({ squadSize: 4 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, venue: 'x', matchDate: new Date().toISOString(), oversPerInnings: 20, ballsPerOver: 6 })
    const live = await liveMatchService.getLiveMatchState(match.id)
    assert.equal(live.match.status, 'upcoming')
    assert.equal(live.match.isLive, false)
    assert.equal(live.currentInnings, null)
    assert.equal(live.target, null)
  } finally {
    await fx.cleanup()
  }
})
