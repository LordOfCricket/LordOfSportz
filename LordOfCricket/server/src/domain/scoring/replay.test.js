// Domain tests — pure, no database. `node --test` discovers this automatically.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replayInnings, previewCorrection, getAllowedDismissals } from './replay.js'

const SEED = { battingTeamId: 'team-a', bowlingTeamId: 'team-b' }
const FORMAT = { ballsPerOver: 6, oversPerInnings: 20 }

function buildLog() {
  let seq = 0
  const log = []
  return {
    delivery(input) {
      seq += 1
      const id = `d${seq}`
      log.push({
        kind: 'delivery',
        id,
        logSequence: seq,
        isDeadBall: false,
        batRuns: 0,
        illegal: null,
        extra: null,
        wicket: null,
        swapStrikerNonStriker: false,
        bowlerMatchPlayerId: 'bowler1',
        ...input,
      })
      return id
    },
    event(eventType, payload) {
      seq += 1
      const id = `e${seq}`
      log.push({ kind: 'event', id, logSequence: seq, eventType, payload, voided: false })
      return id
    },
    get log() {
      return log
    },
  }
}

function withOpeningLineup(b) {
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'rahul' })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: 'aman' })
  return b
}

test('dot ball: no runs, no strike change', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ batRuns: 0 })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 0)
  assert.equal(s.ends.strikerEnd, 'rahul')
})

for (const runs of [1, 3]) {
  test(`${runs} run(s): odd runs swap strike`, () => {
    const b = withOpeningLineup(buildLog())
    b.delivery({ batRuns: runs })
    const s = replayInnings(b.log, SEED, FORMAT)
    assert.equal(s.runs, runs)
    assert.equal(s.ends.strikerEnd, 'aman')
  })
}

for (const runs of [2, 4, 6]) {
  test(`${runs} run(s): even runs do not swap strike`, () => {
    const b = withOpeningLineup(buildLog())
    b.delivery({ batRuns: runs })
    const s = replayInnings(b.log, SEED, FORMAT)
    assert.equal(s.runs, runs)
    assert.equal(s.ends.strikerEnd, 'rahul')
    if (runs === 4) assert.equal(s.batsmen.rahul.fours, 1)
    if (runs === 6) assert.equal(s.batsmen.rahul.sixes, 1)
  })
}

test('wide: flat penalty only, no strike change, does not count as a legal ball or a ball faced', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ illegal: { type: 'wide', runs: 1 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 1)
  assert.equal(s.legalBalls, 0)
  assert.equal(s.batsmen.rahul.balls, 0)
  assert.equal(s.ends.strikerEnd, 'rahul')
})

test('wide with scampered run: odd total run-equivalent swaps strike', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ illegal: { type: 'wide', runs: 2 } }) // 1 flat + 1 run
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 2)
  assert.equal(s.ends.strikerEnd, 'aman')
})

test('no-ball: flat penalty, free hit next, does not count toward legal balls but does count as a ball faced', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ illegal: { type: 'no-ball', runs: 1 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 1)
  assert.equal(s.legalBalls, 0)
  assert.equal(s.batsmen.rahul.balls, 1)
  assert.equal(s.isFreeHitNext, true)
})

test('no-ball + bat runs: both flat penalty and bat runs counted, batsman credited', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ illegal: { type: 'no-ball', runs: 1 }, batRuns: 4 })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 5)
  assert.equal(s.batsmen.rahul.runs, 4)
  assert.equal(s.batsmen.rahul.fours, 1)
})

test('bye: team runs, no batsman runs credited, strike rotates on odd byes', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ extra: { type: 'bye', runs: 1 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 1)
  assert.equal(s.batsmen.rahul.runs, 0)
  assert.equal(s.batsmen.rahul.balls, 1)
  assert.equal(s.ends.strikerEnd, 'aman')
})

test('leg-bye: same accounting as bye', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ extra: { type: 'leg-bye', runs: 2 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 2)
  assert.equal(s.batsmen.rahul.runs, 0)
  assert.equal(s.ends.strikerEnd, 'rahul')
})

test('wicket (bowled): dismisses the current striker, credited to the bowler', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ wicket: { type: 'bowled' }, bowlerMatchPlayerId: 'bowler1' })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.wickets, 1)
  assert.equal(s.batsmen.rahul.out, true)
  assert.equal(s.ends.strikerEnd, null)
  assert.equal(s.pendingBatsmanSelection, 'strikerEnd')
  assert.equal(s.bowlers.bowler1.wickets, 1)
})

test('run-out: dismisses the non-striker when named, striker end untouched', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ wicket: { type: 'run-out', dismissedMatchPlayerId: 'aman', runsCompleted: 0 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.wickets, 1)
  assert.equal(s.batsmen.aman.out, true)
  assert.equal(s.ends.strikerEnd, 'rahul')
  assert.equal(s.ends.nonStrikerEnd, null)
  assert.equal(s.pendingBatsmanSelection, 'nonStrikerEnd')
  // run-out is never credited to the bowler
  assert.equal(s.bowlers.bowler1?.wickets ?? 0, 0)
})

test('run-out: dismisses the striker when named', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ wicket: { type: 'run-out', dismissedMatchPlayerId: 'rahul', runsCompleted: 0 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.batsmen.rahul.out, true)
  assert.equal(s.ends.strikerEnd, null)
  assert.equal(s.pendingBatsmanSelection, 'strikerEnd')
})

test('free hit: only run-out is an allowed dismissal on the next delivery', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ illegal: { type: 'no-ball', runs: 1 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.isFreeHitNext, true)
  assert.deepEqual(getAllowedDismissals(s, null), ['run-out'])
})

test('end of over: rotates ends and records previousOverBowlerId (configurable ballsPerOver)', () => {
  const format = { ballsPerOver: 5, oversPerInnings: 8 }
  const b = withOpeningLineup(buildLog())
  for (let i = 0; i < 5; i++) b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler1' })
  const s = replayInnings(b.log, SEED, format)
  assert.equal(s.legalBalls, 5)
  assert.equal(s.overNumber, 1)
  assert.equal(s.ballInOver, 0)
  // 5 dot balls: no mid-ball swap, but the over-end swap still fires once
  assert.equal(s.ends.strikerEnd, 'aman')
  assert.equal(s.previousOverBowlerId, 'bowler1')
})

test('odd run on the last ball of an over: the run-swap and the over-end swap compound', () => {
  const b = withOpeningLineup(buildLog())
  for (let i = 0; i < 5; i++) b.delivery({ batRuns: 0 })
  b.delivery({ batRuns: 1 }) // 6th ball, odd
  const s = replayInnings(b.log, SEED, FORMAT)
  // odd run swaps to aman, then over-end swap swaps back — net: same as start of over
  assert.equal(s.ends.strikerEnd, 'rahul')
})

test('critical strike test: 0,1,4,1,0,2 — striker per ball, and who faces the next over', () => {
  const b = withOpeningLineup(buildLog())
  for (const runs of [0, 1, 4, 1, 0, 2]) b.delivery({ batRuns: runs })
  const s = replayInnings(b.log, SEED, FORMAT)
  const facedBy = s.deliveries.map((d) => d.strikerMatchPlayerId)
  assert.deepEqual(facedBy, ['rahul', 'rahul', 'aman', 'aman', 'rahul', 'rahul'])
  assert.equal(s.ends.strikerEnd, 'aman', 'aman should face the first ball of the next over')
})

test('historical correction: fixing an earlier run total reassigns who faced later deliveries, but never changes their physical outcome or bowler', () => {
  const b = withOpeningLineup(buildLog())
  const targetId = b.delivery({ batRuns: 2, bowlerMatchPlayerId: 'bowler1' }) // will be corrected 2 -> 1
  b.delivery({ batRuns: 4, bowlerMatchPlayerId: 'bowler1' }) // the FOUR that must survive unchanged
  b.delivery({ batRuns: 1, bowlerMatchPlayerId: 'bowler1' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler1' })
  b.delivery({ batRuns: 2, bowlerMatchPlayerId: 'bowler1' })

  const before = replayInnings(b.log, SEED, FORMAT)
  const fourBefore = before.deliveries[1]
  assert.equal(fourBefore.totalRuns, 4)
  assert.equal(fourBefore.strikerMatchPlayerId, 'rahul')

  const result = previewCorrection(b.log, SEED, FORMAT, targetId, { batRuns: 1 })
  const fourAfter = result.after.deliveries[1]

  // Physical outcome is untouched — still a FOUR, same bowler.
  assert.equal(fourAfter.totalRuns, 4)
  assert.equal(fourAfter.batRuns, 4)
  assert.equal(fourAfter.bowlerMatchPlayerId, 'bowler1')
  // But the batsman who faced it is now correctly recomputed, with zero manual edits.
  assert.notEqual(fourAfter.strikerMatchPlayerId, fourBefore.strikerMatchPlayerId)
  assert.equal(fourAfter.strikerMatchPlayerId, 'aman')

  // Bowler assignment across every delivery is completely unaffected by a striker-only correction.
  for (let i = 0; i < result.before.deliveries.length; i++) {
    assert.equal(result.after.deliveries[i].bowlerMatchPlayerId, result.before.deliveries[i].bowlerMatchPlayerId)
  }
})

test('replay conflict: a run-out dismissed player that matches neither current end is flagged, not guessed', () => {
  const b = withOpeningLineup(buildLog())
  b.delivery({ batRuns: 0 })
  b.delivery({ wicket: { type: 'run-out', dismissedMatchPlayerId: 'someone-else-entirely', runsCompleted: 0 } })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.conflicts.length, 1)
  assert.equal(s.conflicts[0].type, 'PLAYER_STATE_CONFLICT')
  assert.equal(s.conflicts[0].recordedDismissedPlayer, 'someone-else-entirely')
  // Does not crash, and does not silently mark the wrong player out.
  assert.equal(s.batsmen['someone-else-entirely'], undefined)
})

test('deliveries never carry over.ball as identity — display over/ball is recomputed from legalBalls', () => {
  const format = { ballsPerOver: 6 }
  const b = withOpeningLineup(buildLog())
  for (let i = 0; i < 7; i++) b.delivery({ batRuns: 0 })
  const s = replayInnings(b.log, SEED, format)
  assert.equal(s.deliveries[5].over, 1)
  assert.equal(s.deliveries[5].ball, 6)
  assert.equal(s.deliveries[6].over, 2)
  assert.equal(s.deliveries[6].ball, 1)
})

test('catch dropped is a non-scoring event: no score/wicket/strike change', () => {
  const b = withOpeningLineup(buildLog())
  b.event('catch-dropped', { fielderMatchPlayerId: 'fielder1', difficulty: 'moderate' })
  const s = replayInnings(b.log, SEED, FORMAT)
  assert.equal(s.runs, 0)
  assert.equal(s.wickets, 0)
  assert.equal(s.ends.strikerEnd, 'rahul')
  assert.equal(s.events.length, 3) // 2 opening batsman-in events + this one
})
