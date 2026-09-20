import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inningsBallsForNrr, computeTeamNrrInputs, netRunRate } from './nrr.js'

const OVERS = 20
const BPO = 6
const QUOTA = OVERS * BPO // 120 legal balls

function innings({ battingTeamId, bowlingTeamId, runs, wickets, legalBalls, xi = 11 }) {
  return { battingTeamId, bowlingTeamId, runs, wickets, legalBalls, battingTeamPlayingXiCount: xi }
}

test('NRR — normal completed innings: full quota, not all out', () => {
  const inn = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 150, wickets: 5, legalBalls: 120 })
  assert.equal(inningsBallsForNrr(inn, OVERS, BPO), 120)
  const inputs = computeTeamNrrInputs(1, [inn], OVERS, BPO)
  assert.equal(netRunRate(inputs, BPO), (150 / 120) * 6) // 7.5
})

test('NRR — CRITICAL: 18.4 overs means 18 overs + 4 legal balls, NOT decimal 18.4', () => {
  // 18.4 in scorecard notation = 18*6 + 4 = 112 legal balls, chasing successfully (not all out).
  const inn = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 100, wickets: 4, legalBalls: 112 })
  const legalBallsRate = (100 / 112) * 6
  const wrongDecimalRate = 100 / 18.4 // what a naive "parse the displayed overs as a decimal" bug would compute
  assert.notEqual(legalBallsRate, wrongDecimalRate)
  const inputs = computeTeamNrrInputs(1, [inn], OVERS, BPO)
  assert.equal(netRunRate(inputs, BPO), legalBallsRate)
})

test('NRR — all-out early: batting side is deemed to have faced the FULL quota, not actual balls', () => {
  // All out for 80 in 15.2 overs (92 legal balls) with an 11-a-side XI (all-out threshold = 10 wickets).
  const inn = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 80, wickets: 10, legalBalls: 92, xi: 11 })
  assert.equal(inningsBallsForNrr(inn, OVERS, BPO), QUOTA) // 120, not 92
  const battingInputs = computeTeamNrrInputs(1, [inn], OVERS, BPO)
  assert.equal(netRunRate(battingInputs, BPO), (80 / 120) * 6) // 4.0, not 80/92*6
})

test('NRR — all-out early: the BOWLING side also gets the full quota for that same innings (Part 26)', () => {
  const inn = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 80, wickets: 10, legalBalls: 92, xi: 11 })
  const bowlingInputs = computeTeamNrrInputs(2, [inn], OVERS, BPO)
  assert.equal(bowlingInputs.ballsBowled, 120)
  assert.equal(bowlingInputs.runsConceded, 80)
  assert.equal(netRunRate(bowlingInputs, BPO), -(80 / 120) * 6) // conceding rate only -> negative NRR
})

test('NRR — successful chase in fewer overs: actual legal balls used, NO full-quota adjustment (not all out)', () => {
  // Chased down in 15 overs exactly (90 legal balls), only 3 wickets down.
  const inn = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 121, wickets: 3, legalBalls: 90, xi: 11 })
  assert.equal(inningsBallsForNrr(inn, OVERS, BPO), 90)
  const inputs = computeTeamNrrInputs(1, [inn], OVERS, BPO)
  assert.equal(netRunRate(inputs, BPO), (121 / 90) * 6)
})

test('NRR — team batting second: correctly attributes runs scored vs runs conceded per innings', () => {
  const inn1 = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 150, wickets: 6, legalBalls: 120 })
  const inn2 = innings({ battingTeamId: 2, bowlingTeamId: 1, runs: 140, wickets: 8, legalBalls: 120 })
  const teamAInputs = computeTeamNrrInputs(1, [inn1, inn2], OVERS, BPO)
  assert.equal(teamAInputs.runsScored, 150)
  assert.equal(teamAInputs.runsConceded, 140)
  const teamBInputs = computeTeamNrrInputs(2, [inn1, inn2], OVERS, BPO)
  assert.equal(teamBInputs.runsScored, 140)
  assert.equal(teamBInputs.runsConceded, 150)
})

test('NRR — multiple matches aggregation: totals accumulate across every match, not just one', () => {
  const match1 = [
    innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 150, wickets: 6, legalBalls: 120 }),
    innings({ battingTeamId: 2, bowlingTeamId: 1, runs: 140, wickets: 10, legalBalls: 110, xi: 11 }),
  ]
  const match2 = [
    innings({ battingTeamId: 1, bowlingTeamId: 3, runs: 90, wickets: 10, legalBalls: 95, xi: 11 }),
    innings({ battingTeamId: 3, bowlingTeamId: 1, runs: 91, wickets: 2, legalBalls: 80 }),
  ]
  const inputs = computeTeamNrrInputs(1, [...match1, ...match2], OVERS, BPO)
  // Match 1: scored 150/120. Match 2: all out 90, deemed 90/120 (full quota).
  assert.equal(inputs.runsScored, 150 + 90)
  assert.equal(inputs.ballsFaced, 120 + 120)
  // Match 1: conceded 140, opponent all out -> full quota 120. Match 2: conceded 91/80 (chase, no adjustment).
  assert.equal(inputs.runsConceded, 140 + 91)
  assert.equal(inputs.ballsBowled, 120 + 80)
})

test('NRR — a tied innings still contributes its real runs/balls (ties affect points, not the NRR formula)', () => {
  const inn1 = innings({ battingTeamId: 1, bowlingTeamId: 2, runs: 150, wickets: 6, legalBalls: 120 })
  const inn2 = innings({ battingTeamId: 2, bowlingTeamId: 1, runs: 150, wickets: 6, legalBalls: 120 })
  const inputs = computeTeamNrrInputs(1, [inn1, inn2], OVERS, BPO)
  assert.equal(netRunRate(inputs, BPO), 0) // scored exactly what was conceded
})

test('NRR — zero matches played: neutral 0, never NaN/Infinity, never crashes a sort', () => {
  const inputs = computeTeamNrrInputs(99, [], OVERS, BPO)
  assert.deepEqual(inputs, { runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0 })
  assert.equal(netRunRate(inputs, BPO), 0)
})
