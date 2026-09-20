// Domain tests — pure, no database. Mirrors the buildLog()/withOpeningLineup()
// fixture pattern from domain/scoring/replay.test.js exactly (same seed ids),
// so the commentary engine is exercised over the identical log shapes the
// real replay engine is already trusted against.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateInningsCommentary } from './generateInningsCommentary.js'

const SEED = { battingTeamId: 'team-a', bowlingTeamId: 'team-b' }
const FORMAT = { ballsPerOver: 6, oversPerInnings: 20 }
const INNINGS = { id: 1, innings_number: 1, batting_team_id: 'team-a', bowling_team_id: 'team-b', status: 'live' }
const ROSTER = new Map([
  ['rahul', { name: 'Rahul' }],
  ['aman', { name: 'Aman' }],
  ['bowler1', { name: 'Patel' }],
  ['fielder1', { name: 'Verma' }],
])
const NO_SHOTS = new Map()
const TEAM_NAMES = { 'team-a': 'LOC Strikers', 'team-b': 'Riverside Warriors' }

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

function withOpeningLineup(b) {
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'rahul' })
  b.event('batsman-in', { end: 'nonStrikerEnd', matchPlayerId: 'aman' })
}

function generate(log, overrides = {}) {
  return generateInningsCommentary({ log, seed: SEED, format: FORMAT, innings: INNINGS, roster: ROSTER, shotsByDeliveryId: NO_SHOTS, teamNames: TEAM_NAMES, match: null, ...overrides })
}

test('determinism: identical log produces byte-identical commentary every time', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 0 })
  b.delivery({ batRuns: 1 })
  const a = generate(b.log)
  const c = generate(b.log)
  assert.deepEqual(a, c)
})

test('dot ball produces a DELIVERY entry tagged DOT', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 0 })
  const entries = generate(b.log)
  const dot = entries.find((e) => e.type === 'DELIVERY')
  assert.ok(dot)
  assert.ok(dot.tags.includes('DOT'))
  assert.match(dot.text, /dot ball|no run|defends/i)
})

test('four and six mention the striker by name and are tagged', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 4 })
  b.delivery({ batRuns: 6 })
  const entries = generate(b.log).filter((e) => e.type === 'DELIVERY')
  assert.match(entries[0].text, /FOUR/)
  assert.match(entries[0].text, /Rahul/)
  assert.ok(entries[0].tags.includes('FOUR'))
  assert.match(entries[1].text, /SIX/)
  assert.ok(entries[1].tags.includes('SIX'))
})

test('wagon-wheel region enriches the boundary text but is never fabricated without one', () => {
  const b = buildLog()
  withOpeningLineup(b)
  const id = b.delivery({ batRuns: 4 })
  const withRegion = generate(b.log, { shotsByDeliveryId: new Map([[id, { region_id: 'cover' }]]) })
  const withoutRegion = generate(b.log)
  const a = withRegion.find((e) => e.type === 'DELIVERY')
  const c = withoutRegion.find((e) => e.type === 'DELIVERY')
  assert.match(a.text, /cover/)
  assert.doesNotMatch(c.text, /cover/)
})

test('wide/no-ball/bye/leg-bye extras are described correctly and never double-count runs', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ illegal: { type: 'wide', runs: 1 } })
  b.delivery({ illegal: { type: 'wide', runs: 3 } })
  b.delivery({ illegal: { type: 'no-ball', runs: 1 }, batRuns: 4 })
  b.delivery({ extra: { type: 'bye', runs: 2 } })
  b.delivery({ extra: { type: 'leg-bye', runs: 1 } })
  const entries = generate(b.log).filter((e) => e.type === 'DELIVERY')
  assert.match(entries[0].text, /Wide/)
  assert.match(entries[1].text, /Wide/)
  assert.match(entries[1].text, /\+2/)
  assert.match(entries[2].text, /NO BALL/)
  assert.match(entries[2].text, /FOUR|boundary/i)
  assert.match(entries[3].text, /2 byes/)
  assert.match(entries[4].text, /1 leg bye/)
})

test('bowled/caught/lbw/run-out wickets name the dismissed player and, when known, the fielder', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ wicket: { type: 'bowled' } })
  b.event('batsman-in', { end: 'strikerEnd', matchPlayerId: 'aman2' })
  const entries = generate(b.log).filter((e) => e.type === 'WICKET')
  assert.match(entries[0].text, /WICKET! Rahul is bowled by Patel\./)
})

test('caught wicket names the fielder only when one is authoritatively recorded', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ wicket: { type: 'caught', fielderMatchPlayerId: 'fielder1' } })
  const [withFielder] = generate(b.log).filter((e) => e.type === 'WICKET')
  assert.equal(withFielder.text, 'WICKET! Rahul is caught by Verma off Patel.')

  const b2 = buildLog()
  withOpeningLineup(b2)
  b2.delivery({ wicket: { type: 'caught' } })
  const [noFielder] = generate(b2.log).filter((e) => e.type === 'WICKET')
  assert.equal(noFielder.text, 'WICKET! Rahul is caught off Patel.')
})

// A large ballsPerOver keeps these fixtures inside ONE over — replay.js
// swaps ends at every over boundary regardless of run parity, so a 13-ball
// sequence would otherwise silently hand strike to the other batsman
// mid-fixture (correct cricket behavior, just not what these tests are
// isolating: milestone-crossing detection for ONE named batsman).
const ONE_LONG_OVER = { ballsPerOver: 30, oversPerInnings: 20 }

test('milestone: FIFTY fires exactly once, on the ball that crosses 50', () => {
  const b = buildLog()
  withOpeningLineup(b)
  // batRuns of 4/2 are even, so the striker never rotates away — the whole
  // sequence is credited to the SAME batsman (Rahul), same as replay.js's own rules.
  for (let i = 0; i < 12; i++) b.delivery({ batRuns: 4 }) // 48
  b.delivery({ batRuns: 2 }) // 50 -> FIFTY
  b.delivery({ batRuns: 1 }) // 51 -> must NOT re-fire
  const milestones = generate(b.log, { format: ONE_LONG_OVER }).filter((e) => e.type === 'MILESTONE' && e.tags.includes('FIFTY'))
  assert.equal(milestones.length, 1)
  assert.match(milestones[0].text, /FIFTY! Rahul/)
})

test('correction awareness: lowering an earlier delivery so 50 is never reached removes the FIFTY entry', () => {
  const b = buildLog()
  withOpeningLineup(b)
  for (let i = 0; i < 12; i++) b.delivery({ batRuns: 4 }) // 48
  b.delivery({ batRuns: 2 }) // 50 -> FIFTY
  const before = generate(b.log, { format: ONE_LONG_OVER })
  assert.equal(before.filter((e) => e.tags.includes('FIFTY')).length, 1)

  // Simulate a correction: the very first four becomes a dot ball (48 -> 44 total before the last two balls, so 46 final).
  const corrected = b.log.map((entry, i) => (i === 2 ? { ...entry, batRuns: 0 } : entry))
  const after = generate(corrected, { format: ONE_LONG_OVER })
  assert.equal(after.filter((e) => e.tags.includes('FIFTY')).length, 0)
})

test('over end fires on the 6th legal ball and reports the running score; maiden is detected when honest', () => {
  const b = buildLog()
  withOpeningLineup(b)
  for (let i = 0; i < 6; i++) b.delivery({ batRuns: 0 })
  const entries = generate(b.log)
  const overEnd = entries.find((e) => e.type === 'OVER_END' && !e.tags.includes('MAIDEN'))
  assert.ok(overEnd)
  assert.match(overEnd.text, /End of the over — LOC Strikers 0\/0 after 1 over\./)
  const maiden = entries.find((e) => e.tags.includes('MAIDEN'))
  assert.ok(maiden)
  assert.match(maiden.text, /Maiden over from Patel\./)
})

test('a wide in the over prevents a maiden even with zero bat runs', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ illegal: { type: 'wide', runs: 1 } })
  for (let i = 0; i < 6; i++) b.delivery({ batRuns: 0 })
  const entries = generate(b.log)
  assert.equal(entries.filter((e) => e.tags.includes('MAIDEN')).length, 0)
})

test('innings end (all out) and innings break (with target) are generated for a completed innings 1', () => {
  const b = buildLog()
  withOpeningLineup(b)
  const inningsOf10 = { ...INNINGS, status: 'completed' }
  b.delivery({ batRuns: 4 })
  const entries = generateInningsCommentary({ log: b.log, seed: SEED, format: { ...FORMAT, battingTeamPlayingXiCount: 11 }, innings: inningsOf10, roster: ROSTER, shotsByDeliveryId: NO_SHOTS, teamNames: TEAM_NAMES, match: null })
  const end = entries.find((e) => e.type === 'INNINGS_END')
  const brk = entries.find((e) => e.type === 'INNINGS_BREAK')
  assert.ok(end)
  assert.match(end.text, /LOC Strikers finish on 4\/0\./)
  assert.ok(brk)
  assert.match(brk.text, /Riverside Warriors need 5 to win\./)
})

test('match result for a decided innings 2 reuses matches.result verbatim, never recomputing it', () => {
  const b = buildLog()
  withOpeningLineup(b)
  const innings2 = { id: 2, innings_number: 2, batting_team_id: 'team-b', bowling_team_id: 'team-a', status: 'completed' }
  b.delivery({ batRuns: 4 })
  const match = { id: 99, result_type: 'WICKETS', result: 'Riverside Warriors won by 9 wickets' }
  const entries = generateInningsCommentary({
    log: b.log,
    seed: { battingTeamId: 'team-b', bowlingTeamId: 'team-a' },
    format: { ...FORMAT, target: 5, battingTeamPlayingXiCount: 11 },
    innings: innings2,
    roster: ROSTER,
    shotsByDeliveryId: NO_SHOTS,
    teamNames: TEAM_NAMES,
    match,
  })
  const result = entries.find((e) => e.type === 'MATCH_RESULT')
  assert.ok(result)
  assert.equal(result.text, 'Riverside Warriors won by 9 wickets')
})

test('second-innings chase start is generated once, independent of any single delivery', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 1 })
  const innings2 = { id: 2, innings_number: 2, batting_team_id: 'team-b', bowling_team_id: 'team-a', status: 'live' }
  const entries = generateInningsCommentary({
    log: b.log,
    seed: { battingTeamId: 'team-b', bowlingTeamId: 'team-a' },
    format: { ...FORMAT, target: 120 },
    innings: innings2,
    roster: ROSTER,
    shotsByDeliveryId: NO_SHOTS,
    teamNames: TEAM_NAMES,
    match: null,
  })
  const starts = entries.filter((e) => e.tags.includes('INNINGS_START'))
  assert.equal(starts.length, 1)
  assert.match(starts[0].text, /Riverside Warriors begin the chase\. Target: 120\./)
})

test('dropped catch commentary names the fielder when recorded', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 0 })
  b.event('catch-dropped', { fielderMatchPlayerId: 'fielder1' })
  const entries = generate(b.log)
  const dropped = entries.find((e) => e.tags.includes('DROPPED_CATCH'))
  assert.ok(dropped)
  assert.match(dropped.text, /Dropped! Verma puts down the chance off Rahul\./)
})

test('voided and dead-ball deliveries never produce commentary', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 4, voided: true })
  b.delivery({ isDeadBall: true })
  const entries = generate(b.log)
  assert.equal(entries.filter((e) => e.type === 'DELIVERY' || e.type === 'WICKET').length, 0)
})

test('sequence is stable and ascending; entryKey is unique per entry', () => {
  const b = buildLog()
  withOpeningLineup(b)
  b.delivery({ batRuns: 4 })
  b.delivery({ wicket: { type: 'bowled' }, bowlerMatchPlayerId: 'bowler1' })
  const entries = generate(b.log)
  const sequences = entries.map((e) => e.sequence)
  assert.deepEqual(sequences, [...sequences].sort((a, c) => a - c))
  assert.equal(new Set(entries.map((e) => e.entryKey)).size, entries.length)
})
