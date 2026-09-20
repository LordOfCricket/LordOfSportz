// Run with: node --test src/models/matchProposal.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proposalStatusLabel, proposalStatusClasses } from './matchProposal.model.js'

const KNOWN_STATUSES = ['OPEN', 'CONFIRMED', 'CANCELLED', 'EXPIRED']

test('proposalStatusLabel maps every known status, falls back to the raw value for an unknown one', () => {
  assert.equal(proposalStatusLabel('OPEN'), 'Open')
  assert.equal(proposalStatusLabel('CONFIRMED'), 'Accepted')
  assert.equal(proposalStatusLabel('CANCELLED'), 'Withdrawn')
  assert.equal(proposalStatusLabel('EXPIRED'), 'Expired')
  assert.equal(proposalStatusLabel('SOMETHING_ELSE'), 'SOMETHING_ELSE')
})

test('proposalStatusClasses returns a real class string for every known status, and a safe default otherwise', () => {
  for (const status of KNOWN_STATUSES) {
    const classes = proposalStatusClasses(status)
    assert.ok(classes.length > 0, `status ${status} should have non-empty classes`)
    assert.ok(classes.includes('border-'), `status ${status} should include border color`)
    assert.ok(classes.includes('bg-'), `status ${status} should include background color`)
    assert.ok(classes.includes('text-'), `status ${status} should include text color`)
  }
  assert.equal(proposalStatusClasses('unknown'), proposalStatusClasses('OPEN'))
})
