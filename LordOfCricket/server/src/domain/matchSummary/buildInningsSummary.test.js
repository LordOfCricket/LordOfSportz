// Domain tests — pure, no database. Builds a real replayInnings() log (same
// pattern as statistics.test.js) and proves buildInningsSummary derives
// batting/bowling/FOW/partnerships/overs/timeline correctly from it, without
// re-deriving any cricket rule replay.js hasn't already computed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { replayInnings } from '../scoring/replay.js'
import { buildInningsSummary } from './buildInningsSummary.js'
import { formatDismissalText } from './dismissalText.js'

const SEED = { battingTeamId: 'teamA', bowlingTeamId: 'teamB' }

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
        voided: false,
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

function seatOpeners(b, striker = 'rahul', nonStriker = 'aman') {
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: striker })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: nonStriker })
}

function roster(entries) {
  return new Map(Object.entries(entries).map(([id, name]) => [id, { publicPlayerId: `CVP-${id}`, name, teamId: 'teamA', isCaptain: false, isWicketkeeper: false }]))
}

const ROSTER = roster({
  rahul: 'Rahul Verma',
  aman: 'Aman Gupta',
  vikram: 'Vikram Singh',
  karan: 'Karan Mehta',
  bowler1: 'Yusuf Sheikh',
  bowler2: 'Farhan Ali',
  fielder1: 'Kabir Khan',
})

const FORMAT = { ballsPerOver: 6, oversPerInnings: 4, target: null }
const INNINGS_ROW = { id: 501, innings_number: 1, batting_team_id: 'teamA', bowling_team_id: 'teamB', status: 'completed' }
const PLAYING_XI = ['rahul', 'aman', 'vikram', 'karan']

function summarize(log, { innings = INNINGS_ROW, format = FORMAT, playingXiIds = PLAYING_XI } = {}) {
  const state = replayInnings(log, SEED, format)
  return buildInningsSummary({ innings, state, format, roster: ROSTER, playingXiIds, shotsByDeliveryId: new Map() })
}

// ---------------------------------------------------------------------------
// Fall of wickets
// ---------------------------------------------------------------------------

test('fallOfWickets: chronological, with score/over.ball and resolved player', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 1 })
  b.delivery({ wicket: { type: 'bowled' } }) // ball 2's odd run swapped strike to aman, so aman is dismissed here
  const summary = summarize(b.log)
  assert.equal(summary.fallOfWickets.length, 1)
  assert.equal(summary.fallOfWickets[0].wicketNumber, 1)
  assert.equal(summary.fallOfWickets[0].score, 5)
  assert.equal(summary.fallOfWickets[0].overBall, '0.3')
})

// ---------------------------------------------------------------------------
// Dismissal text
// ---------------------------------------------------------------------------

test('dismissalText: bowled', () => {
  assert.equal(formatDismissalText({ type: 'bowled' }, 'Yusuf Sheikh'), 'b Yusuf Sheikh')
})

test('dismissalText: caught with fielder', () => {
  assert.equal(formatDismissalText({ type: 'caught', fielderName: 'Kabir Khan' }, 'Yusuf Sheikh'), 'c Kabir Khan b Yusuf Sheikh')
})

test('dismissalText: caught with no recorded fielder never invents a name', () => {
  assert.equal(formatDismissalText({ type: 'caught', fielderName: null }, 'Yusuf Sheikh'), 'c b Yusuf Sheikh')
})

test('dismissalText: caught and bowled', () => {
  assert.equal(formatDismissalText({ type: 'caught', fielderName: 'Yusuf Sheikh' }, 'Yusuf Sheikh'), 'c & b Yusuf Sheikh')
})

test('dismissalText: lbw', () => {
  assert.equal(formatDismissalText({ type: 'lbw' }, 'Yusuf Sheikh'), 'lbw b Yusuf Sheikh')
})

test('dismissalText: stumped with keeper', () => {
  assert.equal(formatDismissalText({ type: 'stumped', fielderName: 'Kabir Khan' }, 'Yusuf Sheikh'), 'st Kabir Khan b Yusuf Sheikh')
})

test('dismissalText: run out with one fielder', () => {
  assert.equal(formatDismissalText({ type: 'run-out', fielderName: 'Kabir Khan' }, 'Yusuf Sheikh'), 'run out (Kabir Khan)')
})

test('dismissalText: run out with two fielders', () => {
  assert.equal(formatDismissalText({ type: 'run-out', fielderName: 'Kabir Khan', secondaryFielderName: 'Farhan Ali' }, 'Yusuf Sheikh'), 'run out (Kabir Khan/Farhan Ali)')
})

test('dismissalText: run out with no recorded fielder never invents a name', () => {
  assert.equal(formatDismissalText({ type: 'run-out' }, 'Yusuf Sheikh'), 'run out')
})

test('dismissalText: obstructing the field / hit the ball twice / timed out / retired out never mention a bowler', () => {
  assert.equal(formatDismissalText({ type: 'obstructing-field' }, 'Yusuf Sheikh'), 'obstructing the field')
  assert.equal(formatDismissalText({ type: 'hit-ball-twice' }, 'Yusuf Sheikh'), 'hit the ball twice')
  assert.equal(formatDismissalText({ type: 'timed-out' }, 'Yusuf Sheikh'), 'timed out')
  assert.equal(formatDismissalText({ type: 'retired-out' }, 'Yusuf Sheikh'), 'retired out')
})

test('batting row resolves full dismissal text end-to-end (caught, with fielder attribution)', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 1 }) // swaps strike -> aman on strike
  b.delivery({ wicket: { type: 'caught', fielderMatchPlayerId: 'fielder1' } }) // dismisses aman (striker)
  const summary = summarize(b.log)
  const aman = summary.batting.find((r) => r.player.name === 'Aman Gupta')
  assert.equal(aman.status, 'OUT')
  assert.equal(aman.dismissalText, 'c Kabir Khan b Yusuf Sheikh')
})

// ---------------------------------------------------------------------------
// Not out / DNB / YTB
// ---------------------------------------------------------------------------

test('batter never dismissed is "not out", never confused with DNB', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 1 })
  const summary = summarize(b.log)
  const rahul = summary.batting.find((r) => r.player.name === 'Rahul Verma')
  assert.equal(rahul.status, 'NOT_OUT')
  assert.equal(rahul.dismissalText, 'not out')
})

test('Playing XI member who never batted is DNB once the innings is finished', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 0 })
  const summary = summarize(b.log, { innings: { ...INNINGS_ROW, status: 'completed' } })
  const karan = summary.batting.find((r) => r.player.name === 'Karan Mehta')
  assert.equal(karan.status, 'DNB')
  assert.equal(karan.runs, null)
})

test('Playing XI member who never batted is YTB (not DNB) while the innings is still live', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 0 })
  const summary = summarize(b.log, { innings: { ...INNINGS_ROW, status: 'live' } })
  const karan = summary.batting.find((r) => r.player.name === 'Karan Mehta')
  assert.equal(karan.status, 'YTB')
})

// ---------------------------------------------------------------------------
// Batting / bowling order (Part 70/71) — never Object.keys() id-sort order
// ---------------------------------------------------------------------------

test('batting order follows actual entry order, not match_player id order', () => {
  const b = buildLog()
  // Seat 'vikram' (alphabetically/numerically "later") BEFORE 'aman' to prove
  // order tracks the real batsman-in sequence, not any implicit key sort.
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'vikram' })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: 'aman' })
  b.delivery({ batRuns: 1 })
  const summary = summarize(b.log)
  const order = summary.batting.filter((r) => r.status !== 'DNB' && r.status !== 'YTB').map((r) => r.player.name)
  assert.deepEqual(order, ['Vikram Singh', 'Aman Gupta'])
})

test('bowling order follows first appearance as bowler, not id order', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' })
  b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler1' })
  const summary = summarize(b.log)
  assert.deepEqual(summary.bowling.map((r) => r.player.name), ['Farhan Ali', 'Yusuf Sheikh'])
})

// ---------------------------------------------------------------------------
// Partnerships
// ---------------------------------------------------------------------------

test('partnerships: closes on wicket, opens a fresh one, and includes the trailing unbeaten pair', () => {
  const b = buildLog()
  seatOpeners(b) // rahul & aman
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 1 }) // swap -> aman on strike; partnership so far: 5 runs
  b.delivery({ wicket: { type: 'bowled' } }) // dismisses aman (striker) — this ball's own runs (0) don't count
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'vikram' })
  b.delivery({ batRuns: 2 })
  const summary = summarize(b.log, { innings: { ...INNINGS_ROW, status: 'live' } })
  assert.equal(summary.partnerships.length, 2)
  assert.equal(summary.partnerships[0].runs, 5)
  assert.equal(summary.partnerships[0].endWicketNumber, 1)
  assert.equal(summary.partnerships[0].unbeaten, false)
  assert.deepEqual(summary.partnerships[0].batsmen.map((p) => p.name).sort(), ['Aman Gupta', 'Rahul Verma'])
  assert.equal(summary.partnerships[1].runs, 2)
  assert.equal(summary.partnerships[1].unbeaten, true)
  assert.deepEqual(summary.partnerships[1].batsmen.map((p) => p.name).sort(), ['Rahul Verma', 'Vikram Singh'])
})

test('partnerships: the wicket ball itself contributes to neither the closing nor the next partnership', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 1 }) // swap -> aman on strike, partnership = 1
  b.delivery({ wicket: { type: 'run-out', dismissedMatchPlayerId: 'aman', runsCompleted: 2 }, batRuns: 2 })
  const summary = summarize(b.log, { innings: { ...INNINGS_ROW, status: 'live' } })
  // total runs (3) includes the run-out ball's 2 runs, but partnership total must not.
  assert.equal(summary.total.runs, 3)
  assert.equal(summary.partnerships[0].runs, 1)
})

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

test('extras: wides/no-balls/byes/leg-byes never double-count and sum to the total', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ illegal: { type: 'wide', runs: 2 } }) // 1 mandatory + 1 running wide
  b.delivery({ illegal: { type: 'no-ball', runs: 1 }, batRuns: 4 }) // no-ball penalty + 4 off the bat (bat runs are NOT extras)
  b.delivery({ extra: { type: 'bye', runs: 2 } })
  b.delivery({ extra: { type: 'leg-bye', runs: 1 } })
  const summary = summarize(b.log)
  assert.deepEqual(summary.extras, { wides: 2, noBalls: 1, byes: 2, legByes: 1, total: 6 })
})

// ---------------------------------------------------------------------------
// Over grouping / variable balls-per-over
// ---------------------------------------------------------------------------

test('overs: chronological with correct cumulative score-after-over', () => {
  const b = buildLog()
  seatOpeners(b)
  for (let i = 0; i < 6; i++) b.delivery({ batRuns: 1 }) // over 1: 6 runs
  for (let i = 0; i < 6; i++) b.delivery({ batRuns: 0, bowlerMatchPlayerId: 'bowler2' }) // over 2: 0 runs
  const summary = summarize(b.log)
  assert.equal(summary.overs.length, 2)
  assert.equal(summary.overs[0].over, 1)
  assert.equal(summary.overs[0].runs, 6)
  assert.equal(summary.overs[0].scoreAfter, '6/0')
  assert.equal(summary.overs[1].scoreAfter, '6/0')
})

test('overs: a 5-ball-per-over match never uses a hardcoded 6', () => {
  const format = { ballsPerOver: 5, oversPerInnings: 4, target: null }
  const b = buildLog()
  seatOpeners(b)
  for (let i = 0; i < 5; i++) b.delivery({ batRuns: 1 })
  b.delivery({ batRuns: 2 }) // first ball of over 2
  const summary = summarize(b.log, { format })
  assert.equal(summary.overs.length, 2)
  assert.equal(summary.overs[0].deliveries.length, 5)
  assert.equal(summary.total.oversLabel, '1.1')
})

test('voided deliveries are excluded from over runs/wickets but stay visible in the over group', () => {
  const b = buildLog()
  seatOpeners(b)
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 6, voided: true })
  const summary = summarize(b.log)
  assert.equal(summary.overs[0].deliveries.length, 2)
  assert.equal(summary.overs[0].runs, 4)
})

// ---------------------------------------------------------------------------
// Bowling economy respects the match's own ballsPerOver (mixed-format safe)
// ---------------------------------------------------------------------------

test('bowling economy uses the innings ballsPerOver, not a hardcoded /6', () => {
  const format = { ballsPerOver: 5, oversPerInnings: 4, target: null }
  const b = buildLog()
  seatOpeners(b)
  for (let i = 0; i < 5; i++) b.delivery({ batRuns: 2 }) // one full 5-ball over, 10 runs
  const summary = summarize(b.log, { format })
  const bowlerRow = summary.bowling[0]
  assert.equal(bowlerRow.oversLabel, '1.0')
  assert.equal(bowlerRow.economy, 10) // 10 runs / 1.0 equivalent over
})

// ---------------------------------------------------------------------------
// Correction safety — rebuilding from a patched log produces fresh, not
// stale, scorecard data (no independent second truth to go stale).
// ---------------------------------------------------------------------------

test('correction safety: patching an earlier delivery and rebuilding changes every downstream figure, nothing stays stale', () => {
  const b = buildLog()
  seatOpeners(b)
  const firstBallId = b.delivery({ batRuns: 1 }) // will be corrected below
  b.delivery({ batRuns: 4 })
  b.delivery({ wicket: { type: 'bowled' } })
  const before = summarize(b.log, { innings: { ...INNINGS_ROW, status: 'live' } })

  const patchedLog = b.log.map((e) => (e.id === firstBallId ? { ...e, batRuns: 6 } : e))
  const after = summarize(patchedLog, { innings: { ...INNINGS_ROW, status: 'live' } })

  assert.equal(before.total.runs, 5)
  assert.equal(after.total.runs, 10) // 6 + 4, and the strike-rotation swap-on-odd-runs never fires now
  assert.notEqual(before.fallOfWickets[0].score, after.fallOfWickets[0].score)
  assert.notEqual(before.batting[0].runs, after.batting[0].runs)
})
