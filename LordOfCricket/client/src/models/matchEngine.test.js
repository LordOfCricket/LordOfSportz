// Run with: node --test src/models/matchEngine.test.js
// Uses Node's built-in test runner (Node 20+) — no new dependency for a project that has none today.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createDeliveryEntry, createEventEntry, correctEntry, previewCorrection, deriveInningsState } from './matchEngine.model.js'

const SEED = { battingTeamId: 'team-a', bowlingTeamId: 'team-b' }
const RAHUL = 'rahul'
const AMAN = 'aman'
const BOWLER_1 = 'bowler-shami'
const BOWLER_2 = 'bowler-siraj'

function openers(striker, nonStriker, bowler) {
  return [
    createEventEntry('batsman-in', { end: 'strikerEnd', playerId: striker }),
    createEventEntry('batsman-in', { end: 'nonStrikerEnd', playerId: nonStriker }),
    createEventEntry('bowler-change', { bowlerId: bowler }),
  ]
}

function runs(n) {
  return createDeliveryEntry({ runsBat: n, illegal: null, extra: null, wicket: null, shot: null, isDeadBall: false })
}

function wide(additional = 0) {
  return createDeliveryEntry({ runsBat: 0, illegal: { type: 'wide', runs: 1 + additional }, extra: null, wicket: null, shot: null, isDeadBall: false })
}

function noBall(batRuns = 0) {
  return createDeliveryEntry({ runsBat: batRuns, illegal: { type: 'no-ball', runs: 1 }, extra: null, wicket: null, shot: null, isDeadBall: false })
}

function legBye(n) {
  return createDeliveryEntry({ runsBat: 0, illegal: null, extra: { type: 'leg-bye', runs: n }, wicket: null, shot: null, isDeadBall: false })
}

function fold(log) {
  return deriveInningsState(log, SEED, 20)
}

describe('matchEngine replay', () => {
  test('acceptance scenario: correcting 5.2 from 2 to 1 replays strike correctly through 6.2', () => {
    const log = [
      ...openers(RAHUL, AMAN, BOWLER_1),
      runs(0), // 5.1
      runs(2), // 5.2 -- corrected to 1 below
      runs(4), // 5.3
      runs(1), // 5.4
      runs(0), // 5.5
      runs(2), // 5.6
      runs(1), // 6.1
      runs(4), // 6.2
    ]

    const before = fold(log)
    assert.equal(before.runs, 14)
    assert.equal(before.batsmen[RAHUL].runs, 8) // faces 5.1,5.2,5.3,5.4,6.1 = 0+2+4+1+1
    assert.equal(before.batsmen[AMAN].runs, 6) // faces 5.5,5.6,6.2 = 0+2+4

    const correction5_2 = log[4] // log[0..2] are the opener events, log[3] is 5.1, log[4] is 5.2
    const patchedLog = log.map((e) => (e.id === correction5_2.id ? correctEntry(e, { runsBat: 1 }) : e))
    const after = fold(patchedLog)

    // Per the spec's own expected replay: 5.2 becomes Rahul-1 (strike -> Aman), 5.3 Aman-4 (stays),
    // 5.4 Aman-1 (strike -> Rahul), 5.5 Rahul-dot, 5.6 Rahul-2 (stays), end-of-over swap -> Aman
    // strikes 6.1, 6.1 Aman-1 (strike -> Rahul), 6.2 Rahul-4 (stays).
    assert.equal(after.runs, 13)
    assert.equal(after.ends.strikerEnd, RAHUL)
    assert.equal(after.ends.nonStrikerEnd, AMAN)
    assert.equal(after.batsmen[RAHUL].runs, 7) // 5.1(0) + 5.2(1) + 5.5(0) + 5.6(2) + 6.2(4)
    assert.equal(after.batsmen[RAHUL].balls, 5)
    assert.equal(after.batsmen[AMAN].runs, 6) // 5.3(4) + 5.4(1) + 6.1(1)
    assert.equal(after.batsmen[AMAN].balls, 3)
    assert.equal(after.conflicts.length, 0)

    // Only the corrected delivery's own outcome changed; 5.3-6.2 keep their original recorded
    // results, only the derived context (who faced them) changes. `innings.deliveries` is
    // indexed among deliveries only (events like the openers above don't appear in it), so
    // index 0 is 5.1, index 1 is 5.2, index 2 is 5.3, etc.
    assert.equal(after.deliveries[1].runsBat, 1)
    assert.equal(after.deliveries[2].runsBat, 4)
    assert.equal(after.deliveries[2].strikerId, AMAN)
  })

  test('odd run on the last legal ball of an over combines with end-of-over rotation', () => {
    const log = [...openers(RAHUL, AMAN, BOWLER_1), runs(0), runs(0), runs(0), runs(0), runs(0), runs(1)]
    const state = fold(log)
    // 1 run on 5.6 swaps ends, then the end-of-over swap flips them back -> Rahul strikes 6.1
    assert.equal(state.ends.strikerEnd, RAHUL)
  })

  test('wide increases score/extras without consuming a legal ball or rotating strike on its own', () => {
    const log = [...openers(RAHUL, AMAN, BOWLER_1), wide(0)]
    const state = fold(log)
    assert.equal(state.runs, 1)
    assert.equal(state.legalBalls, 0)
    assert.equal(state.bowlers[BOWLER_1].runs, 1)
    assert.equal(state.bowlers[BOWLER_1].legalBalls, 0)
    assert.equal(state.ends.strikerEnd, RAHUL)
  })

  test('no ball sets free hit for the next delivery and does not consume the over', () => {
    const log = [...openers(RAHUL, AMAN, BOWLER_1), noBall(0)]
    const state = fold(log)
    assert.equal(state.legalBalls, 0)
    assert.equal(state.isFreeHitNext, true)
    assert.equal(state.deliveries.at(-1).isLegalDelivery, false)
  })

  test('leg bye credits the team and not the batsman, and rotates strike on odd runs', () => {
    const log = [...openers(RAHUL, AMAN, BOWLER_1), legBye(1)]
    const state = fold(log)
    assert.equal(state.runs, 1)
    assert.equal(state.batsmen[RAHUL].runs, 0)
    assert.equal(state.batsmen[RAHUL].balls, 1)
    assert.equal(state.ends.strikerEnd, AMAN)
  })

  test('correcting the bowler for an over retroactively moves that over\'s figures', () => {
    const bowlerChange = createEventEntry('bowler-change', { bowlerId: BOWLER_1 })
    const log = [createEventEntry('batsman-in', { end: 'strikerEnd', playerId: RAHUL }), createEventEntry('batsman-in', { end: 'nonStrikerEnd', playerId: AMAN }), bowlerChange, runs(4), runs(1)]
    const before = fold(log)
    assert.equal(before.bowlers[BOWLER_1].runs, 5)

    const patchedLog = log.map((e) => (e.id === bowlerChange.id ? correctEntry(e, { bowlerId: BOWLER_2 }) : e))
    const after = fold(patchedLog)
    assert.equal(after.bowlers[BOWLER_2].runs, 5)
    assert.equal(after.bowlers[BOWLER_1], undefined)
    assert.equal(after.batsmen[RAHUL].runs, before.batsmen[RAHUL].runs)
    assert.equal(after.runs, before.runs)
  })

  test('a strike correction moves a wagon-wheel shot to the correct batsman', () => {
    const shot = { x: 0.5, y: -0.5, angle: 45, regionId: 'cover', region: 'Cover', side: 'off' }
    const four = createDeliveryEntry({ runsBat: 4, illegal: null, extra: null, wicket: null, shot, isDeadBall: false })
    const log = [...openers(RAHUL, AMAN, BOWLER_1), four]

    const before = fold(log)
    assert.equal(before.deliveries.at(-1).strikerId, RAHUL)

    const patchedLog = log.map((e) => (e.id === four.id ? correctEntry(e, { swapStrikerNonStriker: true }) : e))
    const after = fold(patchedLog)
    assert.equal(after.deliveries.at(-1).strikerId, AMAN)
    assert.deepEqual(after.deliveries.at(-1).shot, shot)
    assert.equal(after.batsmen[AMAN].runs, 4)
    assert.equal(after.batsmen[RAHUL].runs, 0)
  })

  test('removing a wicket that a later batsman-in depended on is flagged as a conflict, not silently corrupted', () => {
    const wicketDelivery = createDeliveryEntry({
      runsBat: 0,
      illegal: null,
      extra: null,
      isDeadBall: false,
      shot: null,
      wicket: { type: 'bowled', fielderId: null, batsmanOutId: null, direct: false, runsCompleted: 0 },
    })
    const batsmanIn = createEventEntry('batsman-in', { end: 'strikerEnd', playerId: 'newBatsman' })
    const log = [...openers(RAHUL, AMAN, BOWLER_1), wicketDelivery, batsmanIn]

    const before = fold(log)
    assert.equal(before.conflicts.length, 0)
    assert.equal(before.ends.strikerEnd, 'newBatsman')
    assert.equal(before.ends.nonStrikerEnd, AMAN)

    const patchedLog = log.map((e) => (e.id === wicketDelivery.id ? correctEntry(e, { wicket: null }) : e))
    const after = fold(patchedLog)
    // Rahul was never actually out, so the later substitution can't safely apply — it must be
    // flagged, not silently let the substitute overwrite a batsman who was never dismissed.
    assert.equal(after.conflicts.length, 1)
    assert.equal(after.conflicts[0].type, 'lineup-conflict')
    assert.equal(after.conflicts[0].occupantId, RAHUL)
    assert.equal(after.conflicts[0].incomingId, 'newBatsman')
    assert.equal(after.ends.strikerEnd, RAHUL)
    assert.equal(after.ends.nonStrikerEnd, AMAN)
  })

  test('previewCorrection reports an honest pairwise-affected count, not "everything after this index"', () => {
    const shot = { x: 0.1, y: 0.1, angle: 10, regionId: 'long-on', region: 'Long On', side: 'leg' }
    const four = createDeliveryEntry({ runsBat: 4, illegal: null, extra: null, wicket: null, shot, isDeadBall: false })
    const log = [...openers(RAHUL, AMAN, BOWLER_1), runs(1), four]

    // A shot-only correction changes wagon-wheel data but no replay-relevant field, so it should
    // never be reported as "affecting" a delivery.
    const preview = previewCorrection(log, SEED, 20, four.id, { shot: { ...shot, region: 'Deep Cover' } })
    assert.equal(preview.affectedDeliveryCount, 0)
  })
})
