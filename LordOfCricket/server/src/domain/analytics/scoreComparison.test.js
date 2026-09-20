import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScoreComparisonSeries } from './scoreComparison.js'

test('buildScoreComparisonSeries: reshapes two progressions into a teamA/teamB series', () => {
  const progA = [{ over: 1, cumulativeRuns: 6, cumulativeWickets: 0, runRate: 6 }]
  const progB = [{ over: 1, cumulativeRuns: 4, cumulativeWickets: 1, runRate: 4 }]
  const series = buildScoreComparisonSeries(progA, 1, progB, 2)
  assert.equal(series.teamA.teamId, 1)
  assert.equal(series.teamB.teamId, 2)
  assert.deepEqual(series.teamA.points, [{ over: 1, cumulativeRuns: 6, cumulativeWickets: 0 }])
})

test('buildScoreComparisonSeries: innings of different lengths are never padded/fabricated', () => {
  const progA = [{ over: 1, cumulativeRuns: 6, cumulativeWickets: 0 }, { over: 2, cumulativeRuns: 10, cumulativeWickets: 0 }]
  const progB = [{ over: 1, cumulativeRuns: 4, cumulativeWickets: 1 }]
  const series = buildScoreComparisonSeries(progA, 1, progB, 2)
  assert.equal(series.teamA.points.length, 2)
  assert.equal(series.teamB.points.length, 1)
})
