import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUICK_INCENTIVE_AMOUNTS, proposalStatusLabel, proposalStatusClasses } from './umpireProposal.model.js'

const KNOWN_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED']

test('QUICK_INCENTIVE_AMOUNTS matches the Uber/Rapido-style bonus pills', () => {
  assert.deepEqual(QUICK_INCENTIVE_AMOUNTS, [50, 100, 200])
})

test('proposalStatusLabel maps every known status, falls back to the raw value for an unknown one', () => {
  assert.equal(proposalStatusLabel('PENDING'), 'Pending')
  assert.equal(proposalStatusLabel('ACCEPTED'), 'Accepted')
  assert.equal(proposalStatusLabel('EXPIRED'), 'No Longer Available')
  assert.equal(proposalStatusLabel('SOMETHING_ELSE'), 'SOMETHING_ELSE')
})

test('proposalStatusClasses returns a real class string for every known status, and a safe default otherwise', () => {
  for (const status of KNOWN_STATUSES) {
    assert.ok(proposalStatusClasses(status).length > 0)
  }
  assert.equal(proposalStatusClasses('unknown'), proposalStatusClasses('PENDING'))
})
