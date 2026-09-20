import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeUtilization } from './utilization.js'

test('computeUtilization: known mix reconciles to exact percentages', () => {
  const r = computeUtilization({ totalHours: 16, bookedHours: 4, blockedHours: 2, matchHours: 6 })
  assert.equal(r.bookedPercentage, 25)
  assert.equal(r.blockedPercentage, 12.5)
  assert.equal(r.matchPercentage, 37.5)
  assert.equal(r.utilizedPercentage, 75)
  assert.equal(r.freeHours, 4)
})

test('computeUtilization: fully utilized -> 100%, zero free hours', () => {
  const r = computeUtilization({ totalHours: 16, bookedHours: 16, blockedHours: 0, matchHours: 0 })
  assert.equal(r.utilizedPercentage, 100)
  assert.equal(r.freeHours, 0)
})

test('computeUtilization: zero total hours -> all null percentages, never a division-by-zero NaN', () => {
  const r = computeUtilization({ totalHours: 0, bookedHours: 0, blockedHours: 0, matchHours: 0 })
  assert.equal(r.bookedPercentage, null)
  assert.equal(r.utilizedPercentage, null)
})

test('computeUtilization: never a negative freeHours even with an inconsistent over-count', () => {
  const r = computeUtilization({ totalHours: 10, bookedHours: 8, blockedHours: 4, matchHours: 0 })
  assert.equal(r.freeHours, 0)
})
