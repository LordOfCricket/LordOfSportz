import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDismissalBreakdown } from './dismissalBreakdown.js'

test('buildDismissalBreakdown: groups and counts by friendly label, sorted most-common-first', () => {
  const rows = [
    { dismissal_type: 'caught' }, { dismissal_type: 'caught' }, { dismissal_type: 'bowled' },
    { dismissal_type: 'lbw' }, { dismissal_type: 'run-out' }, { dismissal_type: 'stumped' },
  ]
  const r = buildDismissalBreakdown(rows)
  assert.deepEqual(r[0], { type: 'Caught', count: 2 })
  assert.ok(r.some((x) => x.type === 'Run Out' && x.count === 1))
})

test('buildDismissalBreakdown: rare dismissal types collapse into "Other", never a raw enum string', () => {
  const rows = [{ dismissal_type: 'hit-wicket' }, { dismissal_type: 'obstructing-field' }, { dismissal_type: 'timed-out' }]
  const r = buildDismissalBreakdown(rows)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0], { type: 'Other', count: 3 })
})

test('buildDismissalBreakdown: empty input -> empty array, never a crash', () => {
  assert.deepEqual(buildDismissalBreakdown([]), [])
})
