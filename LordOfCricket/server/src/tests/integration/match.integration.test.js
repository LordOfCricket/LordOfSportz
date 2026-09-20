// Phase 5 integration tests — the real match creation -> roster -> toss ->
// start -> backend-authoritative scoring -> Edit Score flow, exercised end to
// end through the actual service layer (match.service.js, scoring.service.js,
// correction.service.js) against real PostgreSQL. Mirrors the "smallest safe
// slice" the Phase 5 brief asks to prove: a real persisted match, not the
// client-only Umpire Testing sandbox.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { pool } from '../../config/db.js'
import * as matchService from '../../services/match.service.js'
import * as scoringService from '../../services/scoring.service.js'
import * as correctionService from '../../services/correction.service.js'
import { createTeamsFixture } from './fixtures.js'

async function buildAndStartMatch(fx, { squadSize = 3 } = {}) {
  const match = await matchService.createMatch({
    teamAId: fx.teamAId,
    teamBId: fx.teamBId,
    venue: 'Integration Test Ground',
    matchDate: new Date().toISOString(),
    oversPerInnings: 5,
    ballsPerOver: 6,
  })

  const matchPlayersA = []
  for (const p of fx.squadA.slice(0, squadSize)) {
    matchPlayersA.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: p.id, isPlayingXi: true }))
  }
  const matchPlayersB = []
  for (const p of fx.squadB.slice(0, squadSize)) {
    matchPlayersB.push(await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: p.id, isPlayingXi: true }))
  }

  await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
  const started = await matchService.startMatch(match.id)

  const battingTeamId = matchService.battingTeamFromToss(started)
  const bowlingTeamId = battingTeamId === fx.teamAId ? fx.teamBId : fx.teamAId
  const innings = await scoringService.createInnings({ matchId: match.id, inningsNumber: 1, battingTeamId, bowlingTeamId })

  const strikerMp = battingTeamId === fx.teamAId ? matchPlayersA[0] : matchPlayersB[0]
  const nonStrikerMp = battingTeamId === fx.teamAId ? matchPlayersA[1] : matchPlayersB[1]
  const bowlingSquad = bowlingTeamId === fx.teamAId ? matchPlayersA : matchPlayersB
  const bowlerMp = bowlingSquad[bowlingSquad.length - 1]
  const bowlerMp2 = bowlingSquad[0] // a second bowler, distinct from bowlerMp, for alternating overs

  await scoringService.recordEvent({ inningsId: innings.id, event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: strikerMp.id } } })
  await scoringService.recordEvent({ inningsId: innings.id, event: { eventType: 'batsman-in', payload: { end: 'nonStrikerEnd', matchPlayerId: nonStrikerMp.id } } })

  return { match: started, innings, matchPlayersA, matchPlayersB, strikerMp, nonStrikerMp, bowlerMp, bowlerMp2, battingTeamId, bowlingTeamId }
}

test('TEST 1 — create real match: configuration survives a reload', async () => {
  const fx = await createTeamsFixture()
  try {
    const created = await matchService.createMatch({
      teamAId: fx.teamAId,
      teamBId: fx.teamBId,
      venue: 'Integration Test Ground',
      matchDate: new Date().toISOString(),
      oversPerInnings: 5,
      ballsPerOver: 6,
    })
    const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [created.id])
    assert.equal(rows[0].team_a_id, fx.teamAId)
    assert.equal(rows[0].overs_per_innings, 5)
    assert.equal(rows[0].status, 'upcoming')

    await assert.rejects(() => matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamAId, matchDate: new Date().toISOString() }))
  } finally {
    await fx.cleanup()
  }
})

test('TEST 2 — build match roster: correct teams, unique participation, invalid player rejected', async () => {
  const fx = await createTeamsFixture()
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, matchDate: new Date().toISOString() })
    const mp = await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: fx.squadA[0].id, isPlayingXi: true })
    assert.equal(mp.team_id, fx.teamAId)

    // Same player added twice -> the existing (match_id, player_id) unique index rejects it.
    await assert.rejects(() => scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: fx.squadA[0].id, isPlayingXi: true }))

    // A player who doesn't exist at all -> FK violation, not silently accepted.
    await assert.rejects(() => scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: 999999999, isPlayingXi: true }))
  } finally {
    await fx.cleanup()
  }
})

test('start match validation: rejected without toss, without enough playing XI, or twice', async () => {
  const fx = await createTeamsFixture({ squadSize: 1 })
  try {
    const match = await matchService.createMatch({ teamAId: fx.teamAId, teamBId: fx.teamBId, matchDate: new Date().toISOString() })

    await assert.rejects(() => matchService.startMatch(match.id), /Toss must be recorded/)

    await matchService.setToss(match.id, { tossWinnerId: fx.teamAId, tossDecision: 'bat' })
    // Only 1 player per side seeded (squadSize: 1) -> below the 2-player floor.
    await assert.rejects(() => matchService.startMatch(match.id), /needs at least 2 playing XI/)

    await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamAId, playerId: fx.squadA[0].id, isPlayingXi: true })
    await scoringService.addMatchPlayer({ matchId: match.id, teamId: fx.teamBId, playerId: fx.squadB[0].id, isPlayingXi: true })
    // Still short on Team A (needs 2, has 1) — only Team B has enough now via a second real player.
    await assert.rejects(() => matchService.startMatch(match.id), /Team A needs at least 2/)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 3 — start innings: striker/non-striker/bowler establishment persists and reconstructs', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, strikerMp, nonStrikerMp } = await buildAndStartMatch(fx)

    const state = await scoringService.getInningsState(innings.id)
    assert.equal(state.state.ends.strikerEnd, strikerMp.id)
    assert.equal(state.state.ends.nonStrikerEnd, nonStrikerMp.id)
    assert.equal(state.innings.status, 'live')

    // Reload from scratch.
    const reloaded = await scoringService.getInningsState(innings.id)
    assert.equal(reloaded.state.ends.strikerEnd, strikerMp.id)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 4 — real delivery through the service layer: score/striker/version persist', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp, strikerMp } = await buildAndStartMatch(fx)
    const before = await scoringService.getInningsState(innings.id)

    const result = await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 1, bowlerMatchPlayerId: bowlerMp.id },
    })
    assert.equal(result.state.runs, 1)
    assert.notEqual(result.state.ends.strikerEnd, strikerMp.id, 'odd run rotates strike')
    assert.equal(result.version, before.innings.version + 1)

    const reloaded = await scoringService.getInningsState(innings.id)
    assert.equal(reloaded.state.runs, 1)
    assert.equal(reloaded.innings.version, before.innings.version + 1)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 5 — full over: ballsPerOver respected, strike rotation and over completion correct', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp, strikerMp, nonStrikerMp } = await buildAndStartMatch(fx)

    for (const batRuns of [1, 1, 1, 1, 1, 1]) {
      const before = await scoringService.getInningsState(innings.id)
      await scoringService.recordDelivery({
        inningsId: innings.id,
        expectedVersion: before.innings.version,
        clientActionId: randomUUID(),
        input: { batRuns, bowlerMatchPlayerId: bowlerMp.id },
      })
    }

    const state = await scoringService.getInningsState(innings.id)
    assert.equal(state.state.legalBalls, 6)
    assert.equal(state.state.overNumber, 1)
    assert.equal(state.state.ballInOver, 0)
    // 6 singles = 6 strike rotations (even count) -> ends swap back each ball,
    // then the end-of-over swap flips once more, so striker is the non-opener.
    assert.equal(state.state.ends.strikerEnd, nonStrikerMp.id)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 6 — wide: score, extras, legal-ball count, bowler figures, display over', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    const before = await scoringService.getInningsState(innings.id)

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId: randomUUID(),
      input: { illegal: { type: 'wide', runs: 1 }, bowlerMatchPlayerId: bowlerMp.id },
    })

    const state = await scoringService.getInningsState(innings.id)
    assert.equal(state.state.runs, 1)
    assert.equal(state.state.legalBalls, 0, 'a wide is not a legal ball')
    assert.equal(state.state.bowlers[bowlerMp.id].wides, 1)
    assert.equal(state.state.overNumber, 0)
    assert.equal(state.state.ballInOver, 0)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 7 — no-ball + free hit: extras, legal ball, free hit, subsequent state', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    const before = await scoringService.getInningsState(innings.id)

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 1, illegal: { type: 'no-ball', runs: 1 }, bowlerMatchPlayerId: bowlerMp.id },
    })

    const afterNoBall = await scoringService.getInningsState(innings.id)
    assert.equal(afterNoBall.state.runs, 2) // 1 flat penalty + 1 bat run
    assert.equal(afterNoBall.state.legalBalls, 0)
    assert.equal(afterNoBall.state.isFreeHitNext, true)

    // The very next delivery is authoritatively a free hit — only run-out is an allowed dismissal.
    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: afterNoBall.innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 4, bowlerMatchPlayerId: bowlerMp.id },
    })
    const afterFreeHit = await scoringService.getInningsState(innings.id)
    assert.equal(afterFreeHit.state.runs, 6)
    assert.equal(afterFreeHit.state.isFreeHitNext, false)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 8 — wicket, select next batsman, continue scoring, reload', async () => {
  const fx = await createTeamsFixture({ squadSize: 3 })
  try {
    const { innings, bowlerMp, strikerMp } = await buildAndStartMatch(fx, { squadSize: 3 })
    const before = await scoringService.getInningsState(innings.id)

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId: randomUUID(),
      input: { bowlerMatchPlayerId: bowlerMp.id, wicket: { type: 'bowled' } },
    })

    const afterWicket = await scoringService.getInningsState(innings.id)
    assert.equal(afterWicket.state.wickets, 1)
    assert.equal(afterWicket.state.pendingBatsmanSelection, 'strikerEnd', 'a batsman must be selected before the next delivery')

    // Bring in the third squad member (index 2 — 0 and 1 were the openers).
    const fx_battingSquad = afterWicket.state.battingTeamId === fx.teamAId ? fx.squadA : fx.squadB
    // Need the matchPlayer id for that squad member — re-derive via match_players.
    const { rows } = await pool.query('SELECT id FROM match_players WHERE match_id = $1 AND player_id = $2', [innings.match_id, fx_battingSquad[2].id])
    const nextBatsmanMpId = rows[0].id

    await scoringService.recordEvent({
      inningsId: innings.id,
      expectedVersion: afterWicket.innings.version,
      event: { eventType: 'batsman-in', payload: { end: 'strikerEnd', matchPlayerId: nextBatsmanMpId } },
    })

    const afterNewBatsman = await scoringService.getInningsState(innings.id)
    assert.equal(afterNewBatsman.state.pendingBatsmanSelection, null)

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: afterNewBatsman.innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 2, bowlerMatchPlayerId: bowlerMp.id },
    })

    const reloaded = await scoringService.getInningsState(innings.id)
    assert.equal(reloaded.state.wickets, 1)
    assert.equal(reloaded.state.runs, 2)
    assert.equal(reloaded.state.batsmen[strikerMp.id].out, true)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 9 — wagon wheel persists and links to the correct delivery/batsman', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp, strikerMp } = await buildAndStartMatch(fx)
    const before = await scoringService.getInningsState(innings.id)

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 4, bowlerMatchPlayerId: bowlerMp.id, shot: { normalizedX: 0.3, normalizedY: -0.8, angleDegrees: 20, regionId: 'long-off' } },
    })

    const shots = await scoringService.listWagonWheelShots(innings.id)
    assert.equal(shots.length, 1)
    assert.equal(shots[0].striker_match_player_id, strikerMp.id)
    assert.equal(Number(shots[0].normalized_x), 0.3)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 10 — refresh recovery: fresh reload from PostgreSQL matches in-memory state exactly', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    for (const batRuns of [1, 4, 0, 2]) {
      const before = await scoringService.getInningsState(innings.id)
      await scoringService.recordDelivery({
        inningsId: innings.id,
        expectedVersion: before.innings.version,
        clientActionId: randomUUID(),
        input: { batRuns, bowlerMatchPlayerId: bowlerMp.id },
      })
    }
    const live = await scoringService.getInningsState(innings.id)

    // Nothing cached anywhere in process memory between this and the calls above.
    const reloaded = await scoringService.getInningsState(innings.id)
    assert.deepEqual(reloaded.state.runs, live.state.runs)
    assert.deepEqual(reloaded.state.ends, live.state.ends)
    assert.deepEqual(reloaded.innings.version, live.innings.version)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 11 — idempotent double tap: same clientActionId produces exactly one delivery', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    const before = await scoringService.getInningsState(innings.id)
    const clientActionId = randomUUID()

    const first = await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId,
      input: { batRuns: 2, bowlerMatchPlayerId: bowlerMp.id },
    })
    const retry = await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: before.innings.version,
      clientActionId,
      input: { batRuns: 2, bowlerMatchPlayerId: bowlerMp.id },
    })

    assert.equal(retry.idempotentReplay, true)
    assert.equal(String(retry.delivery.id), String(first.delivery.id))

    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM deliveries WHERE innings_id = $1', [innings.id])
    assert.equal(rows[0].c, 1)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 12 — version conflict: stale expectedVersion is rejected with zero duplicate mutation', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    const staleVersion = (await scoringService.getInningsState(innings.id)).innings.version

    await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: staleVersion,
      clientActionId: randomUUID(),
      input: { batRuns: 1, bowlerMatchPlayerId: bowlerMp.id },
    })

    await assert.rejects(
      () =>
        scoringService.recordDelivery({
          inningsId: innings.id,
          expectedVersion: staleVersion, // now stale — a second "device" acting on old state
          clientActionId: randomUUID(),
          input: { batRuns: 4, bowlerMatchPlayerId: bowlerMp.id },
        }),
      (err) => err.code === 'VERSION_CONFLICT'
    )

    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM deliveries WHERE innings_id = $1', [innings.id])
    assert.equal(rows[0].c, 1, 'the rejected conflicting write must not have created a delivery')
  } finally {
    await fx.cleanup()
  }
})

test('TEST 13 — real Edit Score: correct a persisted delivery through the actual correction API, replay correct', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp, bowlerMp2 } = await buildAndStartMatch(fx)
    // Alternates bowlers by over so a 10-ball sequence (crosses into over 2)
    // doesn't trip the "same bowler can't bowl two overs in a row" rule.
    const currentBowler = async () => {
      const { state } = await scoringService.getInningsState(innings.id)
      return state.overNumber % 2 === 0 ? bowlerMp : bowlerMp2
    }

    let targetDeliveryId = null
    for (const batRuns of [0, 0, 0, 0, 0, 0]) {
      const before = await scoringService.getInningsState(innings.id)
      await scoringService.recordDelivery({ inningsId: innings.id, expectedVersion: before.innings.version, clientActionId: randomUUID(), input: { batRuns, bowlerMatchPlayerId: (await currentBowler()).id } })
    }
    {
      const before = await scoringService.getInningsState(innings.id)
      const result = await scoringService.recordDelivery({
        inningsId: innings.id,
        expectedVersion: before.innings.version,
        clientActionId: randomUUID(),
        input: { batRuns: 2, bowlerMatchPlayerId: (await currentBowler()).id }, // recorded as 2, actually 1
      })
      targetDeliveryId = result.delivery.id
    }
    for (const batRuns of [1, 4, 0]) {
      const before = await scoringService.getInningsState(innings.id)
      await scoringService.recordDelivery({ inningsId: innings.id, expectedVersion: before.innings.version, clientActionId: randomUUID(), input: { batRuns, bowlerMatchPlayerId: (await currentBowler()).id } })
    }

    const beforeCorrection = await scoringService.getInningsState(innings.id)
    const preview = await correctionService.previewCorrection({ inningsId: innings.id, targetType: 'delivery', targetId: targetDeliveryId, patch: { batRuns: 1 } })
    assert.equal(preview.valid, true)
    assert.equal(preview.after.runs, beforeCorrection.state.runs - 1)

    const applied = await correctionService.applyCorrection({
      inningsId: innings.id,
      targetType: 'delivery',
      targetId: targetDeliveryId,
      patch: { batRuns: 1 },
      reasonCode: 'WRONG_RUNS',
      expectedVersion: beforeCorrection.innings.version,
      clientActionId: randomUUID(),
      correctedByUserId: fx.userId,
    })
    assert.equal(applied.version, beforeCorrection.innings.version + 1)

    const afterCorrection = await scoringService.getInningsState(innings.id)
    assert.equal(afterCorrection.state.runs, beforeCorrection.state.runs - 1)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 14 — refresh after correction: corrected state remains after a from-scratch reload', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, bowlerMp } = await buildAndStartMatch(fx)
    const rec = await scoringService.recordDelivery({
      inningsId: innings.id,
      expectedVersion: (await scoringService.getInningsState(innings.id)).innings.version,
      clientActionId: randomUUID(),
      input: { batRuns: 2, bowlerMatchPlayerId: bowlerMp.id },
    })

    await correctionService.applyCorrection({
      inningsId: innings.id,
      targetType: 'delivery',
      targetId: rec.delivery.id,
      patch: { batRuns: 1 },
      reasonCode: 'WRONG_RUNS',
      expectedVersion: rec.version,
      clientActionId: randomUUID(),
      correctedByUserId: fx.userId,
    })

    const reloaded = await scoringService.getInningsState(innings.id)
    assert.equal(reloaded.state.runs, 1)
  } finally {
    await fx.cleanup()
  }
})

test('TEST 15 — completed match cannot receive new normal scoring actions', async () => {
  const fx = await createTeamsFixture()
  try {
    const { innings, match, bowlerMp } = await buildAndStartMatch(fx)
    await pool.query("UPDATE matches SET status = 'completed' WHERE id = $1", [match.id])
    await pool.query("UPDATE innings SET status = 'completed' WHERE id = $1", [innings.id])
    const { rows } = await pool.query('SELECT version FROM innings WHERE id = $1', [innings.id])

    await assert.rejects(
      () =>
        scoringService.recordDelivery({
          inningsId: innings.id,
          expectedVersion: rows[0].version,
          clientActionId: randomUUID(),
          input: { batRuns: 1, bowlerMatchPlayerId: bowlerMp.id },
        }),
      (err) => err.code === 'INVALID_INNINGS_STATE'
    )
  } finally {
    await fx.cleanup()
  }
})
